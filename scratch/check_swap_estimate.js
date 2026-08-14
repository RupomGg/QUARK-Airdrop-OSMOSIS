const endpoints = [
  "https://osmosis-rest.publicnode.com",
  "https://osmosis.api.kjnodes.com",
  "https://lcd.osmosis.zone"
];

const usdcDenom = "ibc/498A0751C798A0D9A389AA3691123DADA57DAA4FE165D5C75894505B876BA6E4";

async function main() {
  const ep = endpoints[0];
  const amountIn = "40000000"; // 40 OSMO
  const poolId = 1221; // CL pool
  
  const url = `${ep}/osmosis/poolmanager/v1beta1/1221/estimate/out_given_in?token_in=${amountIn}uosmo&token_out_denom=${usdcDenom}`;
  
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.ok) {
      const data = await res.json();
      console.log("Estimate for 40 OSMO:", JSON.stringify(data, null, 2));
    } else {
      console.log("Estimate failed with status:", res.status);
      const text = await res.text();
      console.log("Response text:", text);
    }
  } catch (e) {
    console.error("Error:", e.message);
  }
}

main();
