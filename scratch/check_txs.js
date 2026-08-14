const endpoints = [
  "https://osmosis-rest.publicnode.com",
  "https://osmosis.api.kjnodes.com",
  "https://lcd.osmosis.zone"
];
const address = "osmo18m3pl3jl8wmnvckf3a02ydqygxx0m2tfzky5qg";

async function fetchWithFallback(path) {
  for (const ep of endpoints) {
    try {
      console.log(`Trying ${ep}${path} ...`);
      const res = await fetch(`${ep}${path}`, { signal: AbortSignal.timeout(5000) });
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
    console.log("Fetching transactions for sender:", address);
    const data = await fetchWithFallback(`/cosmos/tx/v1beta1/txs?events=message.sender='${address}'&pagination.limit=10&pagination.descending=true`);
    const txs = data.tx_responses || [];
    console.log(`Found ${txs.length} transaction(s):`);
    for (const tx of txs) {
      console.log(`- TxHash: ${tx.txhash}, Code: ${tx.code}, Gas: ${tx.gas_used}/${tx.gas_wanted}, Memo: "${tx.tx?.body?.memo || ''}"`);
      if (tx.code !== 0) {
        console.log(`  Error: ${tx.raw_log}`);
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

main();
