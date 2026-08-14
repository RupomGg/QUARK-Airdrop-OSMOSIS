const endpoints = [
  "https://osmosis-rest.publicnode.com",
  "https://osmosis.api.kjnodes.com",
  "https://lcd.osmosis.zone"
];

async function main() {
  const hash = "5BC495A571FEB6A9949A500AFB97EA2572E26BF7CB5FFEE067639791AC1913AB";
  const ep = endpoints[0];
  const url = `${ep}/cosmos/tx/v1beta1/txs/${hash}`;
  
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    console.log("Raw logs:", JSON.stringify(data.tx_response?.logs || [], null, 2));
  } catch (e) {
    console.error("Error:", e.message);
  }
}

main();
