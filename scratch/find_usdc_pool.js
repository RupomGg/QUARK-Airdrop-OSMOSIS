const endpoints = [
  "https://osmosis-rest.publicnode.com",
  "https://osmosis.api.kjnodes.com",
  "https://lcd.osmosis.zone"
];

async function checkPool(id) {
  for (const ep of endpoints) {
    try {
      const res = await fetch(`${ep}/osmosis/gamm/v1beta1/pools/${id}`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        console.log(`Pool ${id} (GAMM) on ${ep}:`, JSON.stringify(data.pool?.pool_assets || data.pool?.poolAssets || [], null, 2));
        return;
      }
    } catch {}
    try {
      const res = await fetch(`${ep}/osmosis/concentratedliquidity/v1beta1/pools/${id}`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        console.log(`Pool ${id} (CL) on ${ep}:`, JSON.stringify(data.pool || {}, null, 2));
        return;
      }
    } catch {}
  }
  console.log(`Pool ${id} not found on any endpoint.`);
}

async function main() {
  await checkPool(1011);
  await checkPool(812);
  await checkPool(678);
  await checkPool(1464);
}

main();
