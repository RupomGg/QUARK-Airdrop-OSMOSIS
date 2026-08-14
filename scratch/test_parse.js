import { DEFAULT_LCD } from "../src/lib/cosmos/chain.js";

function parsePoolDenoms(pool) {
  const typeUrl = pool["@type"] ?? pool.typeUrl ?? "";
  console.log("Analyzing pool typeUrl:", typeUrl);
  if (typeUrl.includes("balancer") || typeUrl.includes("Balancer") || typeUrl.includes("gamm.v1beta1.Pool")) {
    const assets = pool.pool_assets ?? pool.poolAssets ?? [];
    console.log("Found assets count:", assets.length);
    return assets.map((a) => {
      console.log("Asset detail:", JSON.stringify(a));
      return a.token?.denom ?? a.token?.denom;
    });
  }
  return [];
}

async function main() {
  const ep = "https://osmosis-rest.publicnode.com";
  const res = await fetch(`${ep}/osmosis/gamm/v1beta1/pools/3481`);
  const data = await res.json();
  const pool = data.pool;
  console.log("Raw pool:", JSON.stringify(pool, null, 2));
  const denoms = parsePoolDenoms(pool);
  console.log("Parsed denoms:", denoms);
}

main();
