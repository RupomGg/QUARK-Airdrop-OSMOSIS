const endpoints = [
  "https://osmosis-rest.publicnode.com",
  "https://osmosis.api.kjnodes.com",
  "https://lcd.osmosis.zone"
];

async function checkPool(id) {
  const ep = endpoints[0];
  try {
    const res = await fetch(`${ep}/osmosis/gamm/v1beta1/pools/${id}`);
    if (res.ok) {
      const data = await res.json();
      console.log(`Pool ${id} GAMM info:`, JSON.stringify(data.pool, null, 2));
    }
  } catch (e) {
    console.error("Error:", e.message);
  }
}

async function main() {
  await checkPool(1369);
  console.log("---");
  await checkPool(1374);
}

main();
