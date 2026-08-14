// SERVER-ONLY. Osmosis GAMM balancer pool creation + LP management.
// Pool creation costs 1000 OSMO on osmosis-1 mainnet (non-refundable).
import { getProtocolSigner } from "./signer.server";
import { msgCreateBalancerPool, msgJoinPool, msgSend, type Coin } from "@/lib/cosmos/messages";
import { getPoolById } from "./osmosisLcd.server";

export async function createBalancerPool(assets: Coin[], swapFee = "0.003") {
  if (assets.length !== 2) throw new Error("Balancer pool needs exactly 2 assets");
  const signer = await getProtocolSigner();
  const poolAssets = assets.map((token) => ({ token, weight: "1" }));
  const res = await signer.client.signAndBroadcast(
    signer.address,
    [msgCreateBalancerPool(signer.address, poolAssets, swapFee)],
    "auto",
    "QUARK create pool",
  );
  if (res.code !== 0) throw new Error(`createPool failed: ${res.rawLog}`);
  return { txHash: res.transactionHash, height: res.height };
}

/**
 * Add liquidity to an existing 2-asset balancer pool, proportional to its
 * CURRENT live reserves (queried fresh, not assumed) — a balancer join must
 * deposit assets in exactly the pool's existing ratio or the excess is
 * simply refunded, so this computes the other asset's required amount from
 * `primaryDenom`'s contribution rather than letting the caller guess it.
 */
export async function addLiquidity(poolId: string, primaryDenom: string, primaryAmount: string) {
  const pool = await getPoolById(poolId);
  if (!pool) throw new Error(`Pool ${poolId} not found`);
  if (!pool.poolAssets || pool.poolAssets.length !== 2) {
    throw new Error(`Pool ${poolId} is not a 2-asset balancer pool`);
  }
  const primaryAsset = pool.poolAssets.find((a) => a.token.denom === primaryDenom);
  const otherAsset = pool.poolAssets.find((a) => a.token.denom !== primaryDenom);
  if (!primaryAsset || !otherAsset) {
    throw new Error(`Denom ${primaryDenom} not found in pool ${poolId}`);
  }
  if (!pool.totalShares) throw new Error(`Pool ${poolId} has no total_shares reported`);

  const primaryReserve = BigInt(primaryAsset.token.amount);
  const otherReserve = BigInt(otherAsset.token.amount);
  const totalShares = BigInt(pool.totalShares.amount);
  const primaryIn = BigInt(primaryAmount);

  // Required amount of the other asset, in the pool's exact current ratio.
  const otherRequired = (primaryIn * otherReserve) / primaryReserve;
  // Expected new shares, rounded down slightly (99.5%) as a safety margin
  // against reserves drifting between this query and the tx landing.
  const shareOutAmount = ((primaryIn * totalShares * 995n) / primaryReserve / 1000n).toString();
  // Allow up to 1% more than computed on each side, so minor reserve drift
  // doesn't fail the join outright. Cosmos SDK's Coins type requires strict
  // ascending denom order or the whole message is rejected as "invalid
  // coins" at validation (harmless — fails before any funds move — but
  // worth getting right rather than retrying blind).
  const tokenInMaxs: Coin[] = [
    { denom: primaryDenom, amount: ((primaryIn * 1010n) / 1000n).toString() },
    { denom: otherAsset.token.denom, amount: ((otherRequired * 1010n) / 1000n).toString() },
  ].sort((a, b) => (a.denom < b.denom ? -1 : a.denom > b.denom ? 1 : 0));

  const signer = await getProtocolSigner();
  const res = await signer.client.signAndBroadcast(
    signer.address,
    [msgJoinPool(signer.address, poolId, shareOutAmount, tokenInMaxs)],
    "auto",
    `QUARK add liquidity pool ${poolId}`,
  );
  if (res.code !== 0) throw new Error(`addLiquidity failed: ${res.rawLog}`);
  return {
    txHash: res.transactionHash,
    height: res.height,
    contributed: [
      { denom: primaryDenom, amount: primaryAmount },
      { denom: otherAsset.token.denom, amount: otherRequired.toString() },
    ],
  };
}

export async function sendFromTreasury(toAddress: string, amount: Coin[]) {
  const signer = await getProtocolSigner();
  const res = await signer.client.signAndBroadcast(
    signer.address,
    [msgSend(signer.address, toAddress, amount)],
    "auto",
    "QUARK send",
  );
  if (res.code !== 0) throw new Error(`send failed: ${res.rawLog}`);
  return { txHash: res.transactionHash, height: res.height };
}
