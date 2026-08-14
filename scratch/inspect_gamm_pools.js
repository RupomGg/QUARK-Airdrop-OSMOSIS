import { DEFAULT_LCD } from "../src/lib/cosmos/chain.js";

async function fetchGammPools() {
  const urlForward = `${DEFAULT_LCD}/osmosis/gamm/v1beta1/pools?pagination.limit=100`;
  const urlReverse = `${DEFAULT_LCD}/osmosis/gamm/v1beta1/pools?pagination.limit=100&pagination.reverse=true`;

  const [resF, resR] = await Promise.all([
    fetch(urlForward, { headers: { Accept: "application/json" } }).then(r => r.ok ? r.json() : null),
    fetch(urlReverse, { headers: { Accept: "application/json" } }).then(r => r.ok ? r.json() : null)
  ]);

  const pools = [];
  if (resF?.pools) pools.push(...resF.pools);
  if (resR?.pools) pools.push(...resR.pools);

  console.log("Forward pools count:", resF?.pools?.length);
  console.log("Reverse pools count:", resR?.pools?.length);

  const uniquePools = Array.from(new Map(pools.map(p => [String(p.id ?? p.poolId), p])).values());
  console.log("Unique pools count:", uniquePools.length);

  console.log("First 5 Forward pool IDs:", resF?.pools?.slice(0, 5).map(p => p.id));
  console.log("First 5 Reverse pool IDs:", resR?.pools?.slice(0, 5).map(p => p.id));

  const has3477 = uniquePools.some(p => String(p.id) === "3477");
  console.log("Is Pool #3477 in the list?", has3477);
  if (has3477) {
    const p3477 = uniquePools.find(p => String(p.id) === "3477");
    console.log("Pool #3477 info:", JSON.stringify(p3477, null, 2));
  }
}

fetchGammPools();
