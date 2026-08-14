import { DEFAULT_LCD } from "../src/lib/cosmos/chain.js";

async function main() {
  const txHash = "0E3F3B1A955938BDC0FF8129C35A8696F6BA6113A6357BD679C1DCC96245F19E";
  const url = `${DEFAULT_LCD}/cosmos/tx/v1beta1/txs/${txHash}`;
  
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    console.log("Tx status:", data.tx_response.code === 0 ? "SUCCESS" : "FAILED");
    console.log("Raw logs:", JSON.stringify(data.tx_response.logs, null, 2));
    
    // Look for pool_id in events
    const events = [];
    for (const log of data.tx_response.logs || []) {
      for (const ev of log.events || []) {
        if (ev.type === "pool_created") {
          console.log("Found pool_created event:", ev.attributes);
        }
      }
    }
  } catch (e) {
    console.error("Error:", e.message);
  }
}

main();
