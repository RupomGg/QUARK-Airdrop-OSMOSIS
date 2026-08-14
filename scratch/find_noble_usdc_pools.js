const endpoints = [
  "https://osmosis-rest.publicnode.com",
  "https://osmosis.api.kjnodes.com",
  "https://lcd.osmosis.zone"
];

const usdcDenom = "ibc/498A0751C798A0D9A389AA3691123DADA57DAA4FE165D5C75894505B876BA6E4";

async function fetchPools(ep) {
  try {
    const res = await fetch(`${ep}/osmosis/gamm/v1beta1/pools?pagination.limit=100&pagination.reverse=true`, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json();
      for (const pool of data.pools || []) {
        const assets = pool.pool_assets || pool.poolAssets || [];
        const denoms = assets.map(a => a.token?.denom);
        if (denoms.includes(usdcDenom) && denoms.includes("uosmo")) {
          console.log(`Found GAMM Pool: ID ${pool.id}, assets:`, denoms);
        }
      }
    }
  } catch (e) {
    console.log(`Error Gamm ${ep}:`, e.message);
  }

  try {
    const res = await fetch(`${ep}/osmosis/concentratedliquidity/v1beta1/pools?pagination.limit=100`, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json();
      for (const pool of data.pools || []) {
        const denoms = [pool.token0, pool.token1];
        if (denoms.includes(usdcDenom) && denoms.includes("uosmo")) {
          console.log(`Found CL Pool: ID ${pool.id || pool.poolId}, assets:`, denoms);
        }
      }
    }
  } catch (e) {
    console.log(`Error CL ${ep}:`, e.message);
  }
}

async function main() {
  for (const ep of endpoints) {
    console.log(`Searching ${ep}...`);
    await fetchPools(ep);
  }
}

main();
