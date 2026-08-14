# Airdrop Fix — Full Context

## The problem

Client reported: the admin airdrop system was running entirely in
simulation. Clicking "airdrop" in the admin panel never broadcast anything
to Osmosis — no real transaction, nothing visible on Mintscan, recipients
received nothing on-chain.

## Root cause

Two separate admin-facing handlers were both pure in-memory simulation,
despite the app already having a fully-built real on-chain signing layer
that nothing was wired to:

- `handleAirdrop` (legacy single-form airdrop) → `sim.airdropVoucher` in
  `src/api/simContract.ts` — generated a fake `SIM...` hash, touched only an
  in-process JS object.
- `handleContractReserve` / `handleContractSend` (the "Reserve" + "Send"
  forms actually used on the Airdrop admin page) →
  `src/api/contracts/voucherFactoryContract.ts` — same story, explicitly
  documented in its own header comment as "100% simulated... No message is
  ever broadcast to any chain."

Meanwhile `src/api/cosmos/signer.server.ts`, `tokenFactory.server.ts`, and
`liquidity.server.ts` already existed, worked, and were already used by
*other* on-chain flows in the app (on-chain voucher mint/redeem, on-chain
swap, on-chain pool creation) — the airdrop-specific handlers were simply
never connected to them.

Live verification against Osmosis mainnet (read-only LCD queries) also
confirmed:
- vOSMO and vPEPE are real, already-created Token Factory denoms
  (`factory/osmo18m3.../vosmo`, `.../vpepe`), owned by the treasury address
  `osmo18m3pl3jl8wmnvckf3a02ydqygxx0m2tfzky5qg`, holding real balances
  already (4,061 vOSMO / 625 vPEPE at the time).
- Two real GAMM pools already existed for these denoms.
- **The treasury held 0 native `uosmo`** — no gas, so nothing could ever
  broadcast regardless of code correctness. This was the actual blocking
  dependency, separate from the code fix, and needed the client to fund the
  wallet with real OSMO (since resolved — treasury now holds ~90 OSMO).

## Backend changes (the actual fix)

**New helpers:**
- `src/lib/cosmos/address.ts` (new) — `isValidOsmoAddress()`, bech32
  validation so a typo'd/wrong-chain recipient is rejected before any
  broadcast attempt.
- `src/api/cosmos/osmosisLcd.server.ts` — added `denomExistsForCreator()`,
  confirms a Token Factory denom actually exists on-chain before minting or
  sending it.
- `src/api/cosmos/signer.server.ts` — added `hasSufficientGas()`, a
  pre-flight gas balance check so a broadcast fails fast with a clear
  message instead of a confusing mid-transaction fee error.
- `src/lib/cosmos/chain.ts` — added `MIN_GAS_BALANCE_OSMO` constant; made
  `OSMO_CHAIN_ID` / `OSMO_CHAIN_NAME` env-overridable the same way
  `DEFAULT_RPC`/`DEFAULT_LCD` already were (needed for Keplr to suggest the
  correct chain when testing against Osmosis testnet).
- `src/api/cosmos/status.server.ts` — `getChainStatus()` now reports the
  dynamic chain-id instead of a hardcoded `"osmosis-1"` literal.

**`src/api/routes.ts`:**
- `handleContractReserve` — now mints for real (`mintToAddress`) when the
  token is a confirmed on-chain denom and the treasury has gas; otherwise
  falls back to the simulated ledger with a clear `onchainError` explaining
  why (never silently fakes success).
- `handleContractSend` — same real-vs-sim branching, but only for
  `from === "reserve"` (treasury-originated sends). Arbitrary
  address-to-address sends intentionally stay simulated-only — the treasury
  can only ever sign as itself, so a real broadcast can't legitimately claim
  to move funds "from" a user's address without their own signature.
- Both add: recipient address validation, self-send rejection, amount cap
  (`MAX_ADMIN_TOKEN_AMOUNT`), real on-chain balance check before sending
  (not the in-memory counter, which can drift from reality), synchronous
  concurrency locks (`src/api/locks.ts`) against double-submit, and a real
  audit log + `DBTransaction.hash` set to the real tx hash (never a fake
  `SIM...` hash for something that was supposed to be real).
- `handleGetContractStatus` — now also returns `onchainReserve` (the
  treasury's real per-voucher balances) and `treasuryAddress`, so the admin
  UI's "reserve" figures reflect reality instead of only the simulated
  numbers. Fixed once already: originally derived the treasury address via
  `getProtocolSigner()` (a full signing-client connection with its own
  retry logic), which was slower and more failure-prone than needed for a
  read-only balance check — switched to deriving the address offline and
  using the same lightweight `readOnlyClient()` connection the working
  "Treasury needs funding" banner already relied on.
- Standardized micro-unit conversion in `handleSwapVoucherOnchain` to use
  the shared `toMicroUnits()` helper instead of a hand-rolled
  `Math.round(x * 1_000_000)`, so a token with a different decimal exponent
  can't silently mis-scale.
- Extracted `performOnchainRedeem()` — the shared verify/burn/payout
  mechanics used by both real redemption paths (see below), so they can't
  drift apart on the security-critical part.
- Added `handleRedeemWalletOnchain` — see "Redemption gap" below.

**`src/api/handler.ts`:** new authenticated route
`POST /api/vouchers/redeem-wallet-onchain`.

## UI-level changes

**`src/routes/admin.airdrop.tsx`:**
- Reserve form's "Token or Voucher" field changed from free-text input to a
  `<select>` bound to known vouchers — free text let an admin construct an
  arbitrary/invalid denom.
- Success toasts now show the real Mintscan link (`View on Mintscan`) when
  a request actually broadcast on-chain, or a clear "simulated only —
  \<reason>" warning when it didn't.
- Added a "Treasury needs funding for gas" banner (amber), shown whenever
  the treasury's real OSMO balance is below the minimum needed to attempt a
  broadcast.
- Added a "Could not read on-chain reserve balances" banner (red), shown
  when the live balance fetch itself fails (e.g. public RPC issues) — so a
  failure is visible instead of the on-chain figures just silently not
  appearing.
- Voucher dropdown options now show the real on-chain balance inline, e.g.
  `vPEPE (on-chain: 625.11)`.
- The old fully-simulated single-form airdrop was kept for backwards
  compatibility but relabeled "Legacy: simulated-only airdrop (does not
  broadcast)" so it can't be mistaken for the real path now that one exists
  alongside it.

**`src/routes/app.swap.tsx`:**
- New "redeem from wallet" fallback in Voucher→Token mode — see next
  section for why this was needed.

## Redemption gap found during rehearsal (and fixed)

Rehearsing the client's full demo script (airdrop → convert to LVN) surfaced
a second, separate gap: the existing redeem flow
(`handleRedeemVoucherOnchain`, wired to `/api/vouchers/redeem-onchain`)
required a pre-existing `DBVoucher` database record, created only when a
voucher is minted *through the app's own escrow flow*. A voucher airdropped
directly to a wallet by an admin never creates that record — so the
recipient's "Swap & Redeem" page showed "No active vouchers" even though
their wallet genuinely held real vPEPE on-chain, confirmed independently via
direct chain query.

Fix: extracted the shared on-chain verify/burn/payout logic into
`performOnchainRedeem()` and added a second entry point,
`handleRedeemWalletOnchain`, that establishes ownership purely from a
verified on-chain transfer (same `verifyBankSend` mechanism the existing
path already relied on) instead of requiring a DB record. Wired into
`app.swap.tsx`: when there are no DB-tracked vouchers to pick from, the
Voucher→Token page now shows a token+amount form instead of a dead end,
using the same Keplr-signed send → verify → payout flow as the original
path.

## Testing infrastructure added

- `.env.testnet` — dedicated, freshly-generated test treasury wallet
  (`osmo122gaydjxh50pqpqhzdkz2sfsjvpw0x6xtfztmc`), completely separate from
  the real mainnet mnemonic, pointed at Osmosis testnet (`osmo-test-5`).
- `npm run dev:testnet` script (`package.json`) — runs the app against that
  file without touching the real `.env`.
- Full rehearsal performed on testnet: created a real Token Factory denom
  pair, minted real supply, and both Reserve (mint) and Send (transfer)
  broadcast for real — independently confirmed via direct LCD queries
  (treasury balance changes, transaction history, recipient balance), not
  just UI trust.

## Findings during live rehearsal (informational, not code changes)

- The free public mainnet endpoints (`rpc.osmosis.zone`, `lcd.osmosis.zone`)
  and the "official" testnet Mintscan explorer proved unreliable/dead during
  testing. Real `.env` was switched to Polkachu's free public endpoints
  (`osmosis-rpc.polkachu.com` / `osmosis-api.polkachu.com`), confirmed
  working, no signup required.
- Real mainnet treasury needed native OSMO for gas — was 0, now funded
  (~90 OSMO) by the client after being asked.
- Real LVN (what vPEPE redeems into) held by the treasury is very small
  (~0.12) — redemption demos need to stay under that until/unless the
  client tops it up further (~5 LVN requested for a cleaner demo number).
- `ALLOW_VOUCHER_REAL_PAYOUT` must be `true` in the real `.env` for
  redemption (steps 5-7) to actually pay out real LVN — currently set to
  `true`.

## Current status

Code fix is complete, typechecked, and build-verified clean. Fully rehearsed
end-to-end on testnet with independently-verified real transactions. Real
mainnet treasury is funded for gas. Blocked only on: (1) confirming the LVN
top-up amount with the client, and (2) running the same walkthrough once
more against real mainnet for the actual delivery recording.
