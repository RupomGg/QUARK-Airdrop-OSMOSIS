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
      const res = await fetch(`${ep}${path}`, { signal: AbortSignal.timeout(10000) });
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
    console.log("Fetching denoms created by", address);
    const denomsData = await fetchWithFallback(`/osmosis/tokenfactory/v1beta1/denoms_from_creator/${address}`);
    console.log("Denoms:", JSON.stringify(denomsData, null, 2));

    console.log("Fetching GAMM pools to see if any contain our denoms (limit=5000)...");
    const poolsData = await fetchWithFallback(`/osmosis/gamm/v1beta1/pools?pagination.limit=5000`);
    const ourPools = (poolsData.pools || []).filter(p => {
      const assets = p.pool_assets || p.poolAssets || [];
      return assets.some(a => a.token.denom.includes(address));
    });
    console.log(`Found ${ourPools.length} pool(s) containing our denoms:`);
    console.log(JSON.stringify(ourPools, null, 2));
  } catch (error) {
    console.error("Error checking on-chain data:", error);
  }
}

main();
