import { getProtocolSigner } from "../src/api/cosmos/signer.server.js";
import { swapOnOsmosis } from "../src/api/cosmos/osmosisSwap.server.js";
import { buildFactoryDenom } from "../src/lib/cosmos/denom.js";

async function main() {
  try {
    console.log("Initializing protocol signer...");
    const signer = await getProtocolSigner();
    console.log("Treasury address:", signer.address);

    const fromDenom = buildFactoryDenom(signer.address, "vosmo");
    const toDenom = buildFactoryDenom(signer.address, "vtestabc");
    const amountIn = "100000000"; // 100 VOSMO

    console.log(`Executing on-chain swap of 100 VOSMO -> VTESTABC...`);
    const result = await swapOnOsmosis(fromDenom, toDenom, amountIn);
    console.log("Swap Succeeded!");
    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error("Swap failed with error:", error);
  }
}

main();
