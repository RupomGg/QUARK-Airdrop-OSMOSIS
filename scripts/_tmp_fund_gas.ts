// One-off script: send a small amount of real native OSMO from the treasury
// to a wallet so it can pay its own gas fees. Deleted after use.
import { getProtocolSigner } from "@/api/cosmos/signer.server";
import { sendFromTreasury } from "@/api/cosmos/liquidity.server";

const TARGET_WALLET = "osmo1wsvgra320h2dhakl05ra69ql2wmrzl3z7nuqsg";
const AMOUNT_UOSMO = "100000"; // 0.1 OSMO

async function main() {
  const signer = await getProtocolSigner();
  console.log("Sending from treasury:", signer.address);
  const res = await sendFromTreasury(TARGET_WALLET, [{ denom: "uosmo", amount: AMOUNT_UOSMO }]);
  console.log(
    "FUND_RESULT_JSON:" +
      JSON.stringify({
        txHash: res.txHash,
        height: res.height,
        toAddress: TARGET_WALLET,
        amountOsmo: "0.1",
        mintscanUrl: `https://www.mintscan.io/osmosis/tx/${res.txHash}`,
      }),
  );
}

main().catch((e) => {
  console.error("FUND_FAILED:", e?.message || String(e));
  process.exit(1);
});
