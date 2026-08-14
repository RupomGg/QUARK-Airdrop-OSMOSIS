const endpoints = [
  "https://osmosis-rest.publicnode.com",
  "https://osmosis.api.kjnodes.com",
  "https://lcd.osmosis.zone"
];

async function main() {
  const ep = endpoints[0];
  const id = 1464;
  try {
    const res = await fetch(`${ep}/osmosis/concentratedliquidity/v1beta1/pools/${id}`);
    if (res.ok) {
      const data = await res.json();
      console.log(`Pool ${id} CL info:`, JSON.stringify(data, null, 2));
    } else {
      console.log(`Pool ${id} CL fetch failed with status: ${res.status}`);
    }
  } catch (e) {
    console.error("Error CL:", e.message);
  }

  try {
    const res = await fetch(`${ep}/osmosis/gamm/v1beta1/pools/${id}`);
    if (res.ok) {
      const data = await res.json();
      console.log(`Pool ${id} GAMM info:`, JSON.stringify(data, null, 2));
    } else {
      console.log(`Pool ${id} GAMM fetch failed with status: ${res.status}`);
    }
  } catch (e) {
    console.error("Error GAMM:", e.message);
  }
}

main();
