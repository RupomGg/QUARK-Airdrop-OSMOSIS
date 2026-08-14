const lcdUrl = "https://osmosis-rest.publicnode.com";

async function main() {
  try {
    console.log("Querying GAMM params...");
    const res = await fetch(`${lcdUrl}/osmosis/gamm/v1beta1/params`);
    const data = await res.json();
    console.log("GAMM Params:", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Failed to query GAMM params:", error);
  }
}

main();
