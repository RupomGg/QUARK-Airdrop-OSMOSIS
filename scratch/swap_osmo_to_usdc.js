import { getProtocolSigner } from "../src/api/cosmos/signer.server.js";

async function main() {
  try {
    console.log("Initializing protocol signer...");
    const signer = await getProtocolSigner();
    console.log("Treasury address:", signer.address);

    const usdcDenom = "ibc/498A0751C798A0D9A389AA3691123DADA57DAA4FE165D5C75894505B876BA6E4";
    const amountIn = "580000000"; // 580 OSMO

    console.log(`Preparing to swap ${Number(amountIn) / 1_000_000} OSMO to USDC...`);
    
    // Construct the swap message
    const msg = {
      typeUrl: "/osmosis.poolmanager.v1beta1.MsgSwapExactAmountIn",
      value: {
        sender: signer.address,
        routes: [
          {
            poolId: "1221", // Primary OSMO/USDC pool
            tokenOutDenom: usdcDenom
          }
        ],
        tokenIn: {
          denom: "uosmo",
          amount: amountIn
        },
        tokenOutMinAmount: "1" // Slippage protection
      }
    };

    console.log("Broadcasting swap transaction...");
    const res = await signer.client.signAndBroadcast(
      signer.address,
      [msg],
      "auto",
      "QUARK fund treasury USDC"
    );

    if (res.code !== 0) {
      throw new Error(`Swap failed: ${res.rawLog}`);
    }

    console.log("Swap succeeded! TxHash:", res.transactionHash);

  } catch (error) {
    console.error("Execution failed:", error);
  }
}

main();
