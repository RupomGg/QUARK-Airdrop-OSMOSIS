// SERVER-ONLY. Execute real token swaps on Osmosis GAMM via the protocol treasury.
// Uses MsgSwapExactAmountIn to swap factory denoms through an existing GAMM pool.
import { getProtocolSigner } from "./signer.server";
import { msgSwapExactAmountIn, msgBurn, msgMint } from "@/lib/cosmos/messages";
import { findAllPoolsByDenoms, type OsmosisPoolInfo } from "./osmosisLcd.server";
import { buildFactoryDenom, voucherSubdenom } from "@/lib/cosmos/denom";
import { DEFAULT_LCD } from "@/lib/cosmos/chain";

export interface OnChainSwapResult {
  txHash: string;
  height: number;
  amountOut: string;
  poolId: string;
  mintscanUrl: string;
}

// Estimate the swap output using the chain's own poolmanager estimator, so the
// slippage bound reflects real pool state. Falls back to constant-product math
// from the pool reserves if the estimate endpoint is unavailable.
async function estimateSwapOut(
  pool: OsmosisPoolInfo,
  tokenInDenom: string,
  tokenOutDenom: string,
  amountIn: string,
): Promise<bigint> {
  try {
    const qs = new URLSearchParams({
      pool_id: pool.id,
      token_in: `${amountIn}${tokenInDenom}`,
      token_out_denom: tokenOutDenom,
    });
    const res = await fetch(
      `${DEFAULT_LCD}/osmosis/poolmanager/v1beta1/${pool.id}/estimate/single_pool_swap_exact_amount_in?${qs}`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) },
    );
    if (res.ok) {
      const data = await res.json();
      const out = BigInt(data?.token_out_amount ?? "0");
      if (out > 0n) return out;
    }
  } catch {
    // fall through to reserve math
  }

  const reserveIn = BigInt(
    pool.poolAssets?.find((a) => a.token.denom === tokenInDenom)?.token.amount ?? "0",
  );
  const reserveOut = BigInt(
    pool.poolAssets?.find((a) => a.token.denom === tokenOutDenom)?.token.amount ?? "0",
  );
  if (reserveIn <= 0n || reserveOut <= 0n) {
    throw new Error(`Cannot estimate swap output for pool ${pool.id}: no reserves for pair`);
  }
  // Equal-weight balancer: out = reserveOut * amountInWithFee / (reserveIn + amountInWithFee)
  const FEE_SCALE = 1_000_000_000_000_000_000n; // swapFee is an 18-decimal string like "0.003000000000000000"
  const feeScaled = BigInt(Math.round(Number(pool.swapFee ?? "0.003") * 1e18));
  const amountInWithFee = (BigInt(amountIn) * (FEE_SCALE - feeScaled)) / FEE_SCALE;
  return (reserveOut * amountInWithFee) / (reserveIn + amountInWithFee);
}

// Pick the pool that actually gives the best output for THIS trade size.
// GAMM reserves and CL "current tick liquidity" are different units, so
// ranking candidates by a raw size number (as the code used to) silently
// mis-picks whenever both pool types exist for a pair — a CL pool always
// looked like "0 reserve" and lost to any GAMM pool, even a far shallower
// one. Estimating the real output per candidate is unit-agnostic and
// correct by construction.
async function pickBestPool(
  candidates: OsmosisPoolInfo[],
  fromDenom: string,
  toDenom: string,
  amountIn: string,
): Promise<{ pool: OsmosisPoolInfo; estimatedOut: bigint } | null> {
  let best: { pool: OsmosisPoolInfo; estimatedOut: bigint } | null = null;
  for (const pool of candidates) {
    let out: bigint;
    try {
      out = await estimateSwapOut(pool, fromDenom, toDenom, amountIn);
    } catch {
      continue; // candidate has no usable liquidity/estimate — skip it
    }
    if (out > 0n && (!best || out > best.estimatedOut)) {
      best = { pool, estimatedOut: out };
    }
  }
  return best;
}

/**
 * Swap fromDenom → toDenom on Osmosis using the treasury wallet. Finds every
 * pool for the pair via LCD, estimates the real output on each, and uses
 * whichever gives the best price, then broadcasts MsgSwapExactAmountIn with
 * a real slippage bound.
 *
 * @param fromDenom  Full factory denom to sell (e.g. factory/osmo1.../vosmo)
 * @param toDenom    Full factory denom to buy  (e.g. factory/osmo1.../vpepe)
 * @param amountIn   Amount in micro-units (6 decimals), e.g. "1000000" = 1 token
 * @param slippagePct Acceptable slippage 0-100, default 1%
 */
export async function swapOnOsmosis(
  fromDenom: string,
  toDenom: string,
  amountIn: string,
  slippagePct = 1,
): Promise<OnChainSwapResult> {
  const candidates = await findAllPoolsByDenoms(fromDenom, toDenom);
  const best = candidates.length ? await pickBestPool(candidates, fromDenom, toDenom, amountIn) : null;
  const pool = best?.pool ?? null;
  const signer = await getProtocolSigner();

  if (!pool) {
    // No real pool for this pair. Only mimic a swap via burn+mint when the
    // operator explicitly opts in (demo mode) — otherwise fail honestly.
    if (process.env.ALLOW_SWAP_MINT_FALLBACK !== "true") {
      throw new Error(
        `No Osmosis pool exists for ${fromDenom} / ${toDenom}. ` +
          `Create the pool on Osmosis, or set ALLOW_SWAP_MINT_FALLBACK=true for demo burn+mint behavior.`,
      );
    }
    console.log(
      `[swapOnOsmosis] No pool for ${fromDenom} / ${toDenom}; ALLOW_SWAP_MINT_FALLBACK enabled — executing on-chain burn & mint.`,
    );
    const msgs = [
      msgBurn(signer.address, { denom: fromDenom, amount: amountIn }),
      msgMint(signer.address, { denom: toDenom, amount: amountIn }, signer.address),
    ];
    const res = await signer.client.signAndBroadcast(
      signer.address,
      msgs,
      "auto",
      `QUARK swap fallback ${fromDenom} -> ${toDenom}`,
    );
    if (res.code !== 0) {
      throw new Error(`Osmosis swap fallback failed (code ${res.code}): ${res.rawLog}`);
    }
    return {
      txHash: res.transactionHash,
      height: res.height,
      amountOut: amountIn,
      poolId: "fallback-mint",
      mintscanUrl: `https://www.mintscan.io/osmosis/tx/${res.transactionHash}`,
    };
  }

  // best.estimatedOut was already computed while picking the pool above —
  // no need to hit the estimate endpoint a second time for the same pool.
  const estimatedOut = best!.estimatedOut;
  const slippageBps = BigInt(Math.round(Math.min(Math.max(slippagePct, 0), 100) * 100));
  const tokenOutMinAmount = ((estimatedOut * (10_000n - slippageBps)) / 10_000n).toString();

  const msg = msgSwapExactAmountIn(
    signer.address,
    [{ poolId: pool.id, tokenOutDenom: toDenom }],
    { denom: fromDenom, amount: amountIn },
    tokenOutMinAmount === "0" ? "1" : tokenOutMinAmount,
  );

  const res = await signer.client.signAndBroadcast(
    signer.address,
    [msg],
    "auto",
    `QUARK swap ${fromDenom} -> ${toDenom}`,
  );

  if (res.code !== 0) {
    throw new Error(`Osmosis swap failed (code ${res.code}): ${res.rawLog}`);
  }

  // Extract tokenOut amount from events. Osmosis's ProtoRev module can
  // execute its own unrelated arbitrage swaps in the same transaction as
  // ours (triggered by the price movement our swap causes), producing
  // additional token_swapped events — only trust one whose sender and
  // pool_id match OUR OWN message, otherwise we can silently report a
  // completely unrelated swap's output as if it were ours.
  let amountOut = "0";
  for (const event of res.events ?? []) {
    if (event.type !== "token_swapped") continue;
    const attrs = event.attributes ?? [];
    const sender = attrs.find((a: any) => a.key === "sender")?.value;
    const poolId = attrs.find((a: any) => a.key === "pool_id")?.value;
    if (sender !== signer.address || poolId !== pool.id) continue;
    const outAttr = attrs.find((a: any) => a.key === "tokens_out" || a.key === "tokenOut");
    if (!outAttr?.value) continue;
    // Take only the leading digit run (the amount) — stripping all
    // non-digits from the whole "amount+denom" string would concatenate
    // digits embedded in the denom itself (IBC hashes and factory-denom
    // bech32 addresses both contain plenty), producing a wildly wrong
    // number that happens to still look like a plausible amount.
    const match = outAttr.value.match(/^(\d+)/);
    if (match) amountOut = match[1];
  }
  if (amountOut === "0") amountOut = estimatedOut.toString();

  return {
    txHash: res.transactionHash,
    height: res.height,
    amountOut,
    poolId: pool.id,
    mintscanUrl: `https://www.mintscan.io/osmosis/tx/${res.transactionHash}`,
  };
}

/**
 * Build the factory denoms for two token symbols and attempt an on-chain swap.
 * Higher-level helper called from simContract / routes.
 */
export async function swapVouchersOnChain(
  treasuryAddress: string,
  fromSymbol: string,
  toSymbol: string,
  humanAmount: number,
  slippagePct = 1,
): Promise<OnChainSwapResult> {
  // Callers always pass voucher-prefixed symbols (e.g. "vOSMO", "vVTESTABC")
  // built as `v${baseSymbol}` — sim.swapTokens rejects anything else. Recover
  // the true base symbol by stripping exactly that one prefix character, then
  // re-derive the on-chain subdenom via the same canonical helper used at
  // denom-creation time (simContract.ts). Deriving it any other way (e.g.
  // stripping-then-blindly-re-adding "v") double-prefixes whenever the base
  // symbol itself starts with "v"/"V" (like "VTESTABC" -> "vtestabc", not
  // "vvtestabc").
  const baseSymbol = (s: string) => (s.startsWith("v") ? s.slice(1) : s);
  const fromDenom = buildFactoryDenom(treasuryAddress, voucherSubdenom(baseSymbol(fromSymbol)));
  const toDenom = buildFactoryDenom(treasuryAddress, voucherSubdenom(baseSymbol(toSymbol)));

  // Convert human amount to micro-units (6 decimals)
  const amountIn = BigInt(Math.round(humanAmount * 1_000_000)).toString();

  return swapOnOsmosis(fromDenom, toDenom, amountIn, slippagePct);
}
