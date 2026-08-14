const endpoints = [
  "https://osmosis-rest.publicnode.com",
  "https://osmosis.api.kjnodes.com",
  "https://lcd.osmosis.zone"
];
const address = "osmo18m3pl3jl8wmnvckf3a02ydqygxx0m2tfzky5qg";

async function fetchWithFallback(path) {
  for (const ep of endpoints) {
    try {
      console.log(`Trying ${ep}${path} ...`);
      const res = await fetch(`${ep}${path}`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        return await res.json();
      }
      console.log(`Failed with status: ${res.status}`);
    } catch (e) {
      console.log(`Error connecting to ${ep}:`, e.message);
    }
  }
  throw new Error(`All endpoints failed for path: ${path}`);
}

async function main() {
  try {
    console.log("Fetching total number of pools...");
    const data = await fetchWithFallback("/osmosis/poolmanager/v1beta1/num_pools");
    const numPools = Number(data.num_pools || data.numPools);
    console.log("Total pools on Osmosis:", numPools);

    console.log("Checking the last 20 pools for our factory denoms...");
    for (let id = numPools; id > numPools - 20 && id > 0; id--) {
      try {
        const poolData = await fetchWithFallback(`/osmosis/gamm/v1beta1/pools/${id}`);
        const pool = poolData.pool;
        if (pool) {
          const assets = pool.pool_assets || pool.poolAssets || [];
          const hasOurDenom = assets.some(a => a.token.denom.includes(address));
          console.log(`Pool #${id}: type=${pool["@type"]}, assets=${assets.map(a => `${a.token.amount} ${a.token.denom}`).join(", ")}`);
          if (hasOurDenom) {
            console.log(`>>> FOUND OUR POOL! ID: ${id}`);
            console.log(JSON.stringify(pool, null, 2));
            break;
          }
        }
      } catch (e) {
        console.log(`Could not fetch pool #${id}:`, e.message);
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

main();
