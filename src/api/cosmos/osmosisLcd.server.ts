// SERVER-ONLY. Queries the Osmosis LCD (REST) API for pool information.
// Used to verify pool visibility on the Osmosis DEX and find pool IDs for swaps.
import { DEFAULT_LCD } from "@/lib/cosmos/chain";

export interface PoolAssetInfo {
  token: { denom: string; amount: string };
  weight: string;
}

export interface OsmosisPoolInfo {
  id: string;
  type: "gamm" | "concentrated";
  poolAssets?: PoolAssetInfo[];
  token0?: string;
  token1?: string;
  denoms: string[];
  totalShares?: { denom: string; amount: string };
  swapFee?: string;
  currentTickLiquidity?: number;
  mintscanUrl: string;
  lcpUrl: string;
}

// Osmosis mainnet has thousands of pools; a partial scan silently misses pools
// and makes swaps fall back as if no pool exists. Always walk the full
// pagination chain, and cache the result briefly so each swap/UI query does
// not rescan everything.
const MAX_PAGES = 50;
const CACHE_TTL_MS = 60_000;

interface PoolCache {
  fetchedAt: number;
  pools: any[];
}
let gammCache: PoolCache | null = null;
let clCache: PoolCache | null = null;

async function fetchAllPages(basePath: string): Promise<any[]> {
  const pools: any[] = [];
  let nextKey: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = new URLSearchParams({ "pagination.limit": "1000" });
    if (nextKey) qs.set("pagination.key", nextKey);
    const res = await fetch(`${DEFAULT_LCD}${basePath}?${qs}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`LCD ${basePath} failed: HTTP ${res.status}`);
    const data = await res.json();
    if (data?.pools) pools.push(...data.pools);
    nextKey = data?.pagination?.next_key ?? null;
    if (!nextKey) break;
  }
  return pools;
}

// Fetch all GAMM pools (balancer + stableswap), fully paginated + cached.
async function fetchGammPools(): Promise<any[]> {
  if (gammCache && Date.now() - gammCache.fetchedAt < CACHE_TTL_MS) return gammCache.pools;
  try {
    const pools = await fetchAllPages("/osmosis/gamm/v1beta1/pools");
    gammCache = { fetchedAt: Date.now(), pools };
    return pools;
  } catch (e) {
    console.error("[osmosisLcd] fetchGammPools failed:", e);
    return gammCache?.pools ?? [];
  }
}

// Fetch all Concentrated Liquidity pools, fully paginated + cached.
async function fetchClPools(): Promise<any[]> {
  if (clCache && Date.now() - clCache.fetchedAt < CACHE_TTL_MS) return clCache.pools;
  try {
    const pools = await fetchAllPages("/osmosis/concentratedliquidity/v1beta1/pools");
    clCache = { fetchedAt: Date.now(), pools };
    return pools;
  } catch (e) {
    console.error("[osmosisLcd] fetchClPools failed:", e);
    return clCache?.pools ?? [];
  }
}

function parsePoolDenoms(pool: any): string[] {
  const typeUrl: string = pool["@type"] ?? pool.typeUrl ?? "";
  if (
    typeUrl.includes("balancer") ||
    typeUrl.includes("Balancer") ||
    typeUrl.includes("gamm.v1beta1.Pool")
  ) {
    const assets: PoolAssetInfo[] = pool.pool_assets ?? pool.poolAssets ?? [];
    return assets.map((a) => a.token.denom);
  }
  if (typeUrl.includes("stableswap") || typeUrl.includes("Stableswap")) {
    const assets = pool.pool_liquidity ?? pool.poolLiquidity ?? [];
    return assets.map((a: any) => a.denom);
  }
  if (typeUrl.includes("concentrated") || typeUrl.includes("Concentrated")) {
    return [pool.token0 ?? "", pool.token1 ?? ""].filter(Boolean);
  }
  return [];
}

function toPoolInfo(pool: any): OsmosisPoolInfo {
  const denoms = parsePoolDenoms(pool);
  const id = String(pool.id ?? pool.poolId);
  const isConcentrated = Boolean(pool.token0);
  return {
    id,
    type: isConcentrated ? "concentrated" : "gamm",
    poolAssets: pool.pool_assets ?? pool.poolAssets,
    token0: pool.token0,
    token1: pool.token1,
    denoms,
    totalShares: pool.total_shares ?? pool.totalShares,
    swapFee: pool.pool_params?.swap_fee ?? pool.poolParams?.swapFee ?? pool.spread_factor,
    currentTickLiquidity: isConcentrated
      ? Number(pool.current_tick_liquidity ?? pool.currentTickLiquidity ?? 0)
      : undefined,
    mintscanUrl: `https://www.mintscan.io/osmosis/pools/${id}`,
    lcpUrl: `https://app.osmosis.zone/pool/${id}`,
  };
}

// Query a specific pool by ID. The poolmanager endpoint resolves any pool
// type (balancer, stableswap, concentrated); fall back to the GAMM endpoint
// for LCD nodes that don't expose poolmanager.
export async function getPoolById(poolId: string | number): Promise<OsmosisPoolInfo | null> {
  const endpoints = [
    `/osmosis/poolmanager/v1beta1/pools/${poolId}`,
    `/osmosis/gamm/v1beta1/pools/${poolId}`,
  ];
  for (const path of endpoints) {
    try {
      const res = await fetch(`${DEFAULT_LCD}${path}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const pool = data?.pool;
      if (!pool) continue;
      return toPoolInfo(pool);
    } catch {
      continue;
    }
  }
  return null;
}

// Find all pools that contain a given denom in their assets
export async function queryPoolsForDenom(denom: string): Promise<OsmosisPoolInfo[]> {
  const [gammPools, clPools] = await Promise.all([fetchGammPools(), fetchClPools()]);
  return [...gammPools, ...clPools]
    .filter((pool) => parsePoolDenoms(pool).includes(denom))
    .map(toPoolInfo);
}

// Find every pool that contains both denoms (exact match on each side).
// GAMM reserves and CL "current tick liquidity" are different units that
// can't be honestly ranked against each other by size alone — callers that
// care about getting the best trade price should estimate the actual swap
// output across these candidates (see swapOnOsmosis) rather than guess from
// a reserve number.
export async function findAllPoolsByDenoms(
  denomA: string,
  denomB: string,
): Promise<OsmosisPoolInfo[]> {
  const pools = await queryPoolsForDenom(denomA);
  return pools.filter((p) => p.denoms.includes(denomB));
}

// Existence check only (e.g. "does a pool for this pair already exist?").
// Do NOT use this to pick a pool for an actual trade — see
// findAllPoolsByDenoms for why a single "best by reserve" pick is unreliable
// once both GAMM and Concentrated Liquidity pools are candidates.
export async function findPoolByDenoms(
  denomA: string,
  denomB: string,
): Promise<OsmosisPoolInfo | null> {
  const candidates = await findAllPoolsByDenoms(denomA, denomB);
  return candidates[0] ?? null;
}

// Query all factory denom pools for a treasury address
export async function queryFactoryPools(treasuryAddress: string): Promise<OsmosisPoolInfo[]> {
  const [gammPools, clPools] = await Promise.all([fetchGammPools(), fetchClPools()]);
  const prefix = `factory/${treasuryAddress}/`;
  return [...gammPools, ...clPools]
    .filter((pool) => parsePoolDenoms(pool).some((d) => d.startsWith(prefix)))
    .map(toPoolInfo);
}

// Confirms a Token Factory denom was actually created by `creatorAddress`
// before it's used in a real mint/send. Without this, a typo'd or
// never-created voucher symbol (e.g. an admin sending "vXYZ" that was never
// minted) would fail deep inside a broadcast instead of being rejected
// up front, wasting gas and producing a confusing chain error.
export async function denomExistsForCreator(denom: string, creatorAddress: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${DEFAULT_LCD}/osmosis/tokenfactory/v1beta1/denoms_from_creator/${creatorAddress}`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const denoms: string[] = data?.denoms ?? [];
    return denoms.includes(denom);
  } catch (e) {
    console.error("[osmosisLcd] denomExistsForCreator failed:", e);
    // Fail closed: if we can't confirm the denom exists, don't let a real
    // mint/send proceed on an unverified assumption.
    return false;
  }
}

// Check if Osmosis LCD is reachable
export async function checkLcdReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${DEFAULT_LCD}/cosmos/base/tendermint/v1beta1/node_info`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
