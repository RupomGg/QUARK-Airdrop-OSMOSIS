const endpoints = [
  "https://osmosis-rest.publicnode.com",
  "https://osmosis.api.kjnodes.com",
  "https://lcd.osmosis.zone"
];

async function checkPool(id) {
  for (const ep of endpoints) {
    try {
      const res = await fetch(`${ep}/osmosis/concentratedliquidity/v1beta1/pools/${id}`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        console.log(`Pool ${id} on ${ep}:`, JSON.stringify(data.pool || {}, null, 2));
        return;
      }
    } catch (e) {
      // console.log(`Failed Pool ${id} on ${ep}:`, e.message);
    }
  }
  console.log(`Pool ${id} not found on any endpoint.`);
}

async function main() {
  await checkPool(1933);
  await checkPool(1251);
  await checkPool(1247);
  await checkPool(1011);
}

main();
