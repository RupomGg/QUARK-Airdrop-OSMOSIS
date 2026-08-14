# QUARK — Osmosis Mainnet Production Readiness

## Architecture

QUARK uses the **Osmosis Mainnet (osmosis-1)** Token Factory. Every voucher
(`vABC`, `vTRUMP`, ...) IS a Token Factory denom owned by the protocol
treasury account. Liquidity pools are real Osmosis GAMM balancer pools
between voucher denoms. There is no separate backing vault contract.

```
factory/{treasury_address}/v{symbol}  ← real on-chain Token Factory denom
```

## Code Layout

| Path | Role |
|------|------|
| `src/lib/cosmos/chain.ts` | Mainnet chain config + Keplr ChainInfo |
| `src/lib/cosmos/denom.ts` | Factory denom helpers |
| `src/lib/cosmos/messages.ts` | Typed `MsgCreateDenom`, `MsgMint`, `MsgBurn`, `MsgChangeAdmin`, `MsgSetDenomMetadata`, `MsgCreateBalancerPool`, `MsgSend` builders |
| `src/lib/cosmos/keplr.ts` | Browser-only Keplr connect, `experimentalSuggestChain`, `suggestToken`, on-chain balance reads |
| `src/api/cosmos/signer.server.ts` | **SERVER-ONLY** treasury signer (mnemonic → `SigningStargateClient`) |
| `src/api/cosmos/tokenFactory.server.ts` | `createDenom`, `mintToAddress`, `burnFromTreasury`, `changeDenomAdmin` |
| `src/api/cosmos/liquidity.server.ts` | `createBalancerPool`, `sendFromTreasury` |
| `src/api/cosmos/status.server.ts` | `chainConfigured()` / `getChainStatus()` for graceful degradation |

## Required Secrets (Lovable Cloud → Secrets)

| Secret | Purpose | Status |
|--------|---------|--------|
| `OSMO_TREASURY_MNEMONIC` | 24-word mnemonic for the protocol treasury wallet — signs every `MsgCreateDenom`, `MsgMint`, `MsgBurn`, `MsgCreateBalancerPool`. **Funded with ≥1100 OSMO for the first pool + denoms.** | **REQUIRED — not yet provided** |
| `OSMO_RPC_URL` | Paid Tendermint RPC endpoint (Polkachu / Numia / QuickNode). Public endpoints rate-limit and fail under load. | Recommended |
| `OSMO_LCD_URL` | Paid REST/LCD endpoint. | Recommended |

> Until `OSMO_TREASURY_MNEMONIC` is configured, every server function that
> touches the chain throws `MissingTreasuryConfig` with a human-readable
> message. The UI degrades to the in-memory simulation so demos still work.

## Mainnet Cost Schedule (real OSMO)

| Action | Cost |
|--------|------|
| Create Token Factory denom (`MsgCreateDenom`) | **10 OSMO** (non-refundable) |
| Create GAMM balancer pool (`MsgCreateBalancerPool`) | **1000 OSMO** (non-refundable) |
| Mint / Burn / Send | Gas only (~0.001 OSMO) |

Every operation signed with the treasury key spends real OSMO. The buyer is
responsible for funding and securing the mnemonic.

## Voucher Lifecycle (Production)

1. **Admin creates voucher** → `POST /api/admin/voucher/create` → server calls
   `tokenFactory.createDenom("vABC", { symbol, name, ... })`. On success the
   new `factory/.../vabc` denom is persisted in DB with the tx hash.
2. **Admin mints initial supply** → `tokenFactory.mintToAddress(denom, amount, treasury)`.
   Treasury holds the entire initial supply.
3. **Admin airdrops / sells** → `liquidity.sendFromTreasury(user, [{denom, amount}])`.
   User sees the voucher in Keplr after `keplr.suggestToken(denom)`.
4. **Voucher → Voucher swap** → user signs `MsgSwapExactAmountIn` against a
   GAMM pool from Keplr (no server signature needed). *(swap UI wiring pending pool deployment.)*
5. **Redemption** → user signs `MsgBurn` from Keplr OR sends voucher back to
   treasury which calls `tokenFactory.burnFromTreasury(denom, amount)`.
6. **Admin supply control** → `mintToAddress` / `burnFromTreasury` directly
   adjust circulating supply on-chain.

## Authentication & Routing

- User signup / login / admin login: handled by `src/api/auth.ts` against
  Lovable Cloud (Supabase) — already wired.
- Session persistence: `supabase.auth.onAuthStateChange` in the root route.
- Protected routes: `/app/*` gated by `src/routes/app.tsx` `beforeLoad`.
- Wallet connection: `src/lib/cosmos/keplr.ts` `connectKeplr()`. Keplr is
  identity-only (signs swaps & redemptions); login itself is email/password.

## Remaining Infrastructure Tasks (after credentials land)

1. Add `OSMO_TREASURY_MNEMONIC` via the Lovable secrets tool.
2. Fund the treasury address with ≥1100 OSMO for the first launch
   (10 OSMO × N denoms + 1000 OSMO per GAMM pool + gas buffer).
3. (Optional) Configure paid `OSMO_RPC_URL` / `OSMO_LCD_URL`.
4. Run `createDenom` migration for each launch voucher.
5. Run `createBalancerPool` migration for each launch pair.
6. Replace the in-memory `simContract.ts` calls in
   `src/api/routes.ts` with the `tokenFactory.server.ts` /
   `liquidity.server.ts` equivalents (one-line swap per endpoint, gated by
   `chainConfigured()`).

## Build Verification

The codebase compiles in simulation mode (no mnemonic required). All Cosmos
server modules are `*.server.ts` and are excluded from the client bundle by
the TanStack import-protection rules.
