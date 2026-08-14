const endpoints = [
  "https://osmosis-rest.publicnode.com",
  "https://osmosis.api.kjnodes.com",
  "https://lcd.osmosis.zone"
];

const usdcDenom = "ibc/498A0751C798A0D9A389AA3691123DADA57DAA4FE165D5C75894505B876BA6E4";

async function main() {
  const ep = endpoints[0];
  console.log(`Scanning pools on ${ep} using GAMM endpoint (IDs 1-1600)...`);

  const batchSize = 100;
  for (let startId = 1; startId <= 1600; startId += batchSize) {
    const promises = [];
    for (let id = startId; id < startId + batchSize; id++) {
      const poolId = id;
      promises.push((async () => {
        try {
          const res = await fetch(`${ep}/osmosis/gamm/v1beta1/pools/${poolId}`, { signal: AbortSignal.timeout(3000) });
          if (res.ok) {
            const data = await res.json();
            const pool = data.pool || {};
            
            // Check if it's CL pool:
            if (pool.token0 && pool.token1) {
              const denoms = [pool.token0, pool.token1];
              if (denoms.includes(usdcDenom) && denoms.includes("uosmo")) {
                console.log(`Found CL Pool: ID ${poolId}, assets:`, denoms, "spread_factor:", pool.spread_factor);
              }
            } else {
              // It's GAMM pool:
              const assets = pool.pool_assets || pool.poolAssets || [];
              const denoms = assets.map(a => a.token?.denom);
              if (denoms.includes(usdcDenom) && denoms.includes("uosmo")) {
                console.log(`Found GAMM Pool: ID ${poolId}, assets:`, denoms);
              }
            }
          }
        } catch {}
      })());
    }
    await Promise.all(promises);
  }
  console.log("Scan finished.");
}

main();
