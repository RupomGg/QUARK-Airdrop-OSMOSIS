import { queryFactoryPools } from "../src/api/cosmos/osmosisLcd.server.js";

async function main() {
  const address = "osmo18m3pl3jl8wmnvckf3a02ydqygxx0m2tfzky5qg";
  console.log("Querying factory pools for address:", address);
  try {
    const pools = await queryFactoryPools(address);
    console.log("Found pools:");
    console.log(JSON.stringify(pools, null, 2));
  } catch (error) {
    console.error("Query failed:", error);
  }
}

main();