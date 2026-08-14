const endpoints = [
  "https://osmosis-rest.publicnode.com",
  "https://osmosis.api.kjnodes.com",
  "https://lcd.osmosis.zone"
];

const usdcDenom = "ibc/498A0751C798A0D9A389AA3691123DADA57DAA4FE165D5C75894505B876BA6E4";

async function main() {
  const ep = endpoints[0];
  console.log(`Scanning pool IDs on ${ep}...`);

  // We will scan in batches of 50 to run concurrently
  const batchSize = 50;
  for (let startId = 1000; startId <= 1300; startId += batchSize) {
    const promises = [];
    for (let id = startId; id < startId + batchSize; id++) {
      const poolId = id;
      promises.push((async () => {
        try {
          const res = await fetch(`${ep}/osmosis/concentratedliquidity/v1beta1/pools/${poolId}`, { signal: AbortSignal.timeout(3000) });
          if (res.ok) {
            const data = await res.json();
            const pool = data.pool || {};
            const denoms = [pool.token0, pool.token1];
            if (denoms.includes(usdcDenom)) {
              console.log(`Found Pool containing Noble USDC: ID ${poolId}, assets:`, denoms);
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
