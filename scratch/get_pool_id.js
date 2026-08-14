const endpoints = [
  "https://osmosis-rest.publicnode.com",
  "https://osmosis.api.kjnodes.com",
  "https://lcd.osmosis.zone"
];
const txHash = "9C04FF46B8B752BD27BDABD98713B28FFF9AA5F6F48CB089893160782D5C72B4";

async function fetchWithFallback(path) {
  for (const ep of endpoints) {
    try {
      console.log(`Trying ${ep}${path} ...`);
      const res = await fetch(`${ep}${path}`, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        return await res.json();
      }
      console.log(`Failed with status: ${res.status}`);
    } catch (e) {
      console.log(`Error connecting to ${ep}:`, e.message);
    }
  }
  throw new Error(`All endpoints failed for path: ${path}`);
}

async function main() {
  try {
    console.log("Fetching transaction details...");
    const data = await fetchWithFallback(`/cosmos/tx/v1beta1/txs/${txHash}`);
    const events = data.tx_response?.events || [];
    let poolId = null;

    for (const e of events) {
      if (e.type === "pool_created") {
        const attr = e.attributes.find(a => a.key === "pool_id" || a.key === "poolId");
        if (attr) {
          poolId = attr.value;
          console.log("Found pool_created event! Pool ID:", poolId);
        }
      }
    }

    if (!poolId) {
      // Fallback search in all attributes
      for (const e of events) {
        for (const attr of e.attributes) {
          if (attr.key === "pool_id" || attr.key === "poolId") {
            poolId = attr.value;
            console.log(`Found pool ID in event ${e.type}:`, poolId);
          }
        }
      }
    }

    console.log("Full Pool Details:");
    if (poolId) {
      const poolInfo = await fetchWithFallback(`/osmosis/gamm/v1beta1/pools/${poolId}`);
      console.log(JSON.stringify(poolInfo, null, 2));
    } else {
      console.log("No pool ID found in transaction events.");
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

main();
