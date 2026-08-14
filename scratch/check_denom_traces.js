const endpoints = [
  "https://osmosis-rest.publicnode.com",
  "https://osmosis.api.kjnodes.com",
  "https://lcd.osmosis.zone"
];

async function checkTrace(hash) {
  const ep = endpoints[0];
  const url = `${ep}/ibc/apps/transfer/v1/denom_traces/${hash}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.ok) {
      const data = await res.json();
      console.log(`Trace for ${hash}:`, JSON.stringify(data.denom_trace, null, 2));
    } else {
      console.log(`Failed trace for ${hash} with status: ${res.status}`);
    }
  } catch (e) {
    console.error(`Error trace ${hash}:`, e.message);
  }
}

async function main() {
  // Hash from user knowledge:
  await checkTrace("498A0751C798A0D9A389AA3691123DADA57DAA4FE165D5C75894505B876BA6E4");
  // Hash from pool 812:
  await checkTrace("903A61A498756EA560B85A85132D3AEE21B5DEDD41213725D22ABF276EA6945E");
}

main();
