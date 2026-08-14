const endpoints = [
  "https://osmosis-rest.publicnode.com",
  "https://osmosis.api.kjnodes.com",
  "https://lcd.osmosis.zone"
];

async function main() {
  const hash = "27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2";
  const ep = endpoints[0];
  const url = `${ep}/ibc/apps/transfer/v1/denom_traces/${hash}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.ok) {
      const data = await res.json();
      console.log(`Trace:`, JSON.stringify(data.denom_trace, null, 2));
    }
  } catch (e) {
    console.error("Error:", e.message);
  }
}

main();
