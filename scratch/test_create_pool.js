import { getProtocolSigner } from "../src/api/cosmos/signer.server.js";
import { createDenom, mintToAddress } from "../src/api/cosmos/tokenFactory.server.js";
import { createBalancerPool } from "../src/api/cosmos/liquidity.server.js";
import { buildFactoryDenom } from "../src/lib/cosmos/denom.js";

async function main() {
  try {
    console.log("Initializing protocol signer...");
    const signer = await getProtocolSigner();
    console.log("Treasury address:", signer.address);

    const denomVosmo = buildFactoryDenom(signer.address, "vosmo");
    const denomVtest = buildFactoryDenom(signer.address, "vtestabc");

    console.log("Ensuring vosmo denom exists on-chain...");
    try {
      await createDenom("vosmo", { symbol: "OSMO", name: "OSMO Voucher" });
      console.log("Created vosmo denom successfully.");
    } catch (e) {
      console.log("vosmo creation skipped (likely already exists or failed):", e.message);
    }

    console.log("Minting initial vosmo liquidity...");
    try {
      await mintToAddress(denomVosmo, "1000000000", signer.address);
      console.log("Minted vosmo successfully.");
    } catch (e) {
      console.error("Minting vosmo failed:", e.message);
    }

    console.log("Minting initial vtestabc liquidity...");
    try {
      await mintToAddress(denomVtest, "1000000000", signer.address);
      console.log("Minted vtestabc successfully.");
    } catch (e) {
      console.error("Minting vtestabc failed:", e.message);
    }

    console.log("Deploying balancer pool on-chain (costs 100 OSMO fee)...");
    const poolAssets = [
      { denom: denomVosmo, amount: "100000000" },
      { denom: denomVtest, amount: "100000000" }
    ];
    console.log("Pool assets:", JSON.stringify(poolAssets));
    const poolResult = await createBalancerPool(poolAssets, "0.003");
    console.log("Balancer Pool Deployment Result:", poolResult);

  } catch (error) {
    console.error("Pool deployment failed with error:", error);
  }
}

main();
