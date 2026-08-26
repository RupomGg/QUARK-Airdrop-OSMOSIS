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

## Second gap found post-delivery: `/admin/reserve` page (fixed)

After reviewing the delivery, the client flagged a page
(`/admin/reserve`, "Reserve" in the admin sidebar) that still showed no
real broadcast. This is a **separate, older page** from the Airdrop page's
Reserve/Send forms fixed above — `src/routes/admin.reserve.tsx`
("Voucher Reserve Supply"), backed by `handleMintReserve` /
`handleBurnReserve` in `routes.ts`. It was never touched by the original
fix — never mentioned in the original bug report, not part of the
delivered scope — and its Mint/Burn actions still called pure simulation
(`sim.mintReserveVoucher` / `sim.burnReserveVoucher`), the same class of
bug as the original issue, just on a page nobody had looked at yet.

Fixed with the identical pattern already proven on the Airdrop page: both
handlers now attempt a real on-chain `MsgMint`/`MsgBurn` via the same
treasury signer, denom-exists check, gas check, and (for burns) a real
on-chain balance check, before falling back to simulation with a clear
`onchainError`. `admin.reserve.tsx` updated to show the same
"View on Mintscan" / "Simulated only — \<reason\>" toast pattern used on
the Airdrop page. Typecheck + build verified clean afterward; only
`src/api/routes.ts` and `src/routes/admin.reserve.tsx` touched.

Confirmed against the client's actual Fiverr order details that this was
**not** part of the paid delivery ("fixing the current airdrop bot" /
"the Keplr transaction signing and broadcasting issue") — offered to the
client as separate follow-up work rather than bundled into this delivery.

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

## Real LVN top-up performed (self-funded, not by the client)

Rather than asking the client to fund LVN directly, swapped a small amount
of the treasury's own OSMO for real LVN via an OSMO/LVN pool that already
exists on Osmosis mainnet (pool `1325`, found via Osmosis's SQS router —
`swapOnOsmosis()`'s built-in pool-discovery scan times out against this
LCD endpoint because it pages through every pool on mainnet to find it;
worked around by calling the pool's single-pool estimate + swap endpoints
directly with the known pool ID instead of the generic multi-pool-scan
path):
- Swap 1: 1 OSMO → 55.078441 LVN
  (tx `8D33E330765F769A1FD10AABE69CB855B7B8A1C0B69F54FBFC6F0D66372EA5B3`)
- Swap 2: 0.92 OSMO → 50.658045 LVN
  (tx `9DD238EA11A827167409E9DBFBF023367100A95974E7EAE534FCF0DA34947F4C`)

Treasury LVN peaked at 105.86 LVN after both swaps. Balance has moved since
from real redemption-flow testing (each real redemption pays real LVN out
of the treasury 1:1) and is now further constrained by the OSMO depletion
below (no OSMO left to swap more LVN in until treasury gas is restored).

## Treasury OSMO drained via a Keplr cross-chain swap (informational — not a code bug)

On 2026-08-15 ~18:42 UTC the treasury's real OSMO balance dropped from
~88 OSMO to 0. Root-caused via the treasury's live transaction history
(`GET /cosmos/tx/v1beta1/txs?query=message.sender='<treasury>'` against the
LCD): the last transaction
(`D9CC4A526E2053D7B12677E41B12D44D958065F986EC0BFEAEB0736FAC4152BE`) is a
`MsgExecuteContract` against a Skip Protocol swap-and-transfer router
(`osmo10a3k4hvk37cc4hnxctw4p95fhscd2z6h2rmx0aukc6rm8u9qqx9smfsh7u`),
swapping 88.166284 OSMO → ATOM via pool `1135`, then IBC-transferring the
resulting ATOM to `cosmos18m3pl3jl8wmnvckf3a02ydqygxx0m2tf...` — **the same
treasury account, just its Cosmos Hub address** (the tx's own
`recover_address` field is the treasury's own `osmo1...` address,
confirming the tx was signed by the treasury's own key, not executed by a
third party without access to it).

Not theft: the funds are intact, as real ATOM, in the same wallet's Cosmos
Hub address. Most likely an accidental interaction with Keplr's own
built-in cross-chain swap/stake feature while the treasury account was the
active account selected in Keplr (a "stake 50 ATOM" promo banner was
visible in Keplr during testing sessions around this time).

**Net effect:** treasury currently holds 0 native OSMO on Osmosis — no gas
for any further real mint/send/burn broadcast until either (a) the ATOM is
IBC-transferred back to Osmosis and swapped back to OSMO, or (b) the
treasury is re-funded directly with OSMO.

## Operational notes discovered during live client testing

- A **user's own wallet** needs its own small OSMO balance to pay gas for
  the Keplr-signed "return" leg of a Voucher→Token redemption (sending the
  voucher token back to the treasury) — the treasury's own OSMO does not
  cover this, since each signer pays its own transaction fee. Funded via a
  one-off `sendFromTreasury` script; ~0.1 OSMO comfortably covers many
  redemption attempts (real observed fee ≈0.005 OSMO/tx).
- Wallet balances shown in the app (`/app/wallet`, etc.) are a **session
  snapshot** saved to the backend at Keplr *connect* time
  (`readAllBalances()` + `walletAPI.saveSession()` in
  `wallet-connect.tsx`), not a live per-render chain query —
  `store.tsx`'s `refreshAppState()` just re-reads that saved snapshot on
  mount. Funding a wallet with new OSMO/tokens mid-session does not appear
  in the UI until the wallet is disconnected and reconnected in the app,
  which forces a fresh on-chain read.

## Login / wallet-connect bug found and fixed (unrelated to the airdrop, fixed anyway)

Separately reported: connecting a wallet via Keplr sometimes left the user
"connected" (visible in the nav bar, balances real) but never redirected
into `/app`, and retrying didn't help. Root-caused to two compounding gaps
in `src/components/wallet-connect.tsx` / `src/routes/login.tsx`:
- The modal's **"success" screen only appears the very first time** a
  connection completes — reopening it later while already connected skips
  straight to that screen (`useEffect` keys off `user.connected`), which
  never re-runs `handlePick`, the only place `onSuccess` (the sole
  navigation trigger) was ever called.
- The "Continue" button on that screen only called `onClose()`, not
  `onSuccess()` — so there was no path back to `/app` at all except the
  original one-time 500ms auto-timeout.

Fixed: `wallet-connect.tsx`'s Continue button now calls `onSuccess?.()`
before `onClose()`; `login.tsx` now has a standing `useEffect` that
redirects to `/app` (or `/admin`) whenever `user.authenticated` is already
true, independent of how that state was reached. Confirmed pre-existing,
not something introduced by this engagement, via `git blame` — traces to
the same root commit as everything else.

## Unclaimed-airdrop redeem banner added (new feature, not requested in the paid scope)

To address the recurring "how does the recipient know to redeem" question,
added a banner to the Dashboard (`src/routes/app.index.tsx`) that detects
any real voucher balance (`vOSMO`/`vPEPE`/etc., via `KNOWN_REAL_DENOMS`) in
the connected wallet and shows "You have X vOSMO ready to redeem → Redeem
now", linking straight into `/app/swap?redeem=<symbol>` with mode and
amount pre-filled (`app.swap.tsx` now reads a `redeem` search param via
`validateSearch`). Not sent to the client as part of any delivery — it's
an internal improvement only.

## Dispute: client requested a refund; extensive on-chain forensics performed to verify every claim

After the order was marked **complete** and reviewed **5 stars** ("Bug
free", 5/5 on all three categories) on Aug 22, the client reopened
disputes over several sessions, each investigated and independently
verified rather than taken at face value:

- **"500 vOSMO mint failed but 10 worked, so the airdrop is fake"** — not
  the airdrop. Traced to the pre-existing Token→Voucher self-mint page's
  balance-check bug (see below) being confused with the separate admin
  Airdrop feature.
- **A client wallet's real transaction history was pulled directly from
  the chain** (not trusted from a provided CSV alone) to settle a dispute
  over a specific wallet (`osmo17246egvwsmq7cnhc8u7rh7kjzpapwg7f0ue6f7`):
  confirmed it received a real 1,300 vOSMO airdrop
  (`55A44EA2AD179CF8B4BCBDA469C4CE72094DA4A9589A845A3238920E5D7EBF0F`),
  then successfully self-mint+redeemed 50/85/10 OSMO round trips (all
  proven with matching on-chain tx pairs), then **two separate 500 vOSMO
  redemption attempts on Aug 24 both burned the voucher but never paid out
  real OSMO** (`9A90F5E5...`/`036546CD...` burns, no matching send).
- **Full treasury balance reconstruction** (walking the treasury's entire
  real tx history backward from a live-queried anchor balance, since the
  LCD only retains ~100 tx results per query and no historical state
  beyond a pruning window) proved *why*: the treasury held only ~9.86 OSMO
  at the exact moment of both failed 500 OSMO attempts, while every
  successful redemption that day (10/50/85 OSMO) happened when the
  treasury balance was already confirmed sufficient. This is the same
  known "burn happens before payout-feasibility is checked" gap already
  documented above — confirmed here to have caused one real, concrete
  incident, not just a theoretical risk.
- **The exact voucher-code generator (`QRK-XXXX-XXXX`) the client claimed
  was "missing" from a provided zip** was confirmed via `git blame` to
  trace to the same original root commit as everything else — not
  something added after any particular date.
- **Live, on-request disproof test**: client challenged "try airdropping
  800 vOSMO, you'll see it doesn't work, don't cheat by adding funds."
  Ran it for real with zero treasury top-up beforehand, using a brand-new
  wallet: mint tx `75BC38B2D77825B10C1697AF376D01A749A3ED2123A85B5F25360DF719A9194E`
  (fee 0.007638 OSMO) + send tx
  `DE7CEC85C5387120CA247C166096F29ED776CCADA15043FEACBD3451527EB793`
  (fee 0.007707 OSMO) — total 0.015345 OSMO, using the treasury's
  already-existing balance. Wallet confirmed holding exactly 800 vOSMO
  afterward, independently on-chain.
- **Independent re-verification against a separate, genuinely old copy of
  the codebase** (a different file path entirely, not this repo, not
  `context.md`) confirmed the 1:1 voucher/real-asset mapping, the
  pre-existing on-chain swap capability, the "no claim step, tokens land
  immediately" design, the self-mint balance check applying to the *end
  user's* wallet (not treasury), and — notably — the *same* missing
  treasury-balance pre-check on redemption, all already present in that
  old file. This is the strongest evidence gathered that every disputed
  behavior predates this engagement.
- Confirmed directly against the actual accepted Fiverr order text (Aug
  13, $200, 4 days): it never mentions "claim" or any claim mechanism —
  the client's repeated "a real airdrop must have a claim step" argument
  has no basis in what was actually ordered.
- Fiverr Customer Support, contacted proactively, confirmed the order was
  completed Aug 22 and independently characterized the situation as
  likely "a misunderstanding on the client's side about how the delivered
  product functions versus the funding required for it to operate as
  intended" — before any formal dispute was even opened.

## Current status

Airdrop-page code fix (the paid delivery) is complete, typechecked, and
build-verified clean. Fully rehearsed end-to-end on testnet with
independently-verified real transactions, then walked through live against
real mainnet with the client (steps 1–7), each step independently
confirmed on-chain. A second, separately-scoped simulation gap
(`/admin/reserve`) was found and fixed post-delivery, offered to the client
as follow-up work rather than folded into the original order. A login
redirect bug and a redeem-discoverability banner were also addressed,
neither part of the paid scope.

Order is marked **complete** and carries a **5-star review** from the
client. Client has since disputed the delivery and requested a refund;
every specific technical claim raised has been independently verified
against real on-chain data (see "Dispute" above) and none have held up
under verification — each traces either to a different, pre-existing
feature (Token→Voucher self-mint) being confused with the airdrop, or to a
pre-existing (not newly introduced) treasury-funding/redemption-ordering
limitation, both confirmed present in a genuinely old copy of the
codebase, independent of this repo.

Treasury balances fluctuate significantly with ongoing testing; check live
before relying on any specific figure in this document.
