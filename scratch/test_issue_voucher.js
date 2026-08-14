import { getProtocolSigner } from "../src/api/cosmos/signer.server.js";
import { createDenom, mintToAddress } from "../src/api/cosmos/tokenFactory.server.js";
import { voucherSubdenom, buildFactoryDenom } from "../src/lib/cosmos/denom.js";

async function main() {
  try {
    console.log("Initializing protocol signer...");
    const signer = await getProtocolSigner();
    console.log("Treasury address:", signer.address);

    const sub = "vtestabc";
    const denom = buildFactoryDenom(signer.address, sub);
    console.log("Target factory denom:", denom);

    console.log("Attempting to create denom on-chain...");
    const createResult = await createDenom(sub, { symbol: "TESTABC", name: "Test Voucher ABC" });
    console.log("Create Denom Result:", createResult);

    console.log("Attempting to mint 10 tokens to treasury...");
    const mintResult = await mintToAddress(denom, "10000000", signer.address);
    console.log("Mint Result:", mintResult);

  } catch (error) {
    console.error("Test failed with error:", error);
  }
}

main();
