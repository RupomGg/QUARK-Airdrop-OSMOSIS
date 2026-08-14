import { DEFAULT_LCD } from "../src/lib/cosmos/chain.js";

async function main() {
  const tokenIn = "uosmo";
  const tokenOut = "ibc/498A0751C798A0D9A389AA3691123DADA57DAA4FE165D5C75894505B876BA6E4";
  const url = `${DEFAULT_LCD}/osmosis/poolmanager/v1beta1/routes/${tokenIn}/${tokenOut}`;
  
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    console.log("Optimal swap routes:", JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Error:", e.message);
  }
}

main();
