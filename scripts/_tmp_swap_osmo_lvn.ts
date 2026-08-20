// One-off script: swap treasury OSMO for LVN directly on the known pool
// (1325), skipping the full-mainnet pool-discovery scan that swapOnOsmosis()
// does (times out against this LCD endpoint since it pages through every
// Osmosis pool). Deleted after use.
import { getProtocolSigner } from "@/api/cosmos/signer.server";
import { msgSwapExactAmountIn } from "@/lib/cosmos/messages";
import { DEFAULT_LCD } from "@/lib/cosmos/chain";

const LVN_DENOM =
  "factory/osmo1mlng7pz4pnyxtpq0akfwall37czyk9lukaucsrn30ameplhhshtqdvfm5c/ulvn";
const POOL_ID = "1325";
const AMOUNT_IN = "1550000"; // 1.55 OSMO, quoted ~100.56 LVN out

async function main() {
  const qs = new URLSearchParams({
    pool_id: POOL_ID,
    token_in: `${AMOUNT_IN}uosmo`,
    token_out_denom: LVN_DENOM,
  });
  const estRes = await fetch(
    `${DEFAULT_LCD}/osmosis/poolmanager/v1beta1/${POOL_ID}/estimate/single_pool_swap_exact_amount_in?${qs}`,
    { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000) },
  );
  if (!estRes.ok) throw new Error(`Estimate HTTP ${estRes.status}: ${await estRes.text()}`);
  const estData = await estRes.json();
  const estimatedOut = BigInt(estData?.token_out_amount ?? "0");
  if (estimatedOut <= 0n) throw new Error(`Bad estimate: ${JSON.stringify(estData)}`);

  const tokenOutMinAmount = ((estimatedOut * 98n) / 100n).toString(); // 2% slippage

  const signer = await getProtocolSigner();
  const msg = msgSwapExactAmountIn(
    signer.address,
    [{ poolId: POOL_ID, tokenOutDenom: LVN_DENOM }],
    { denom: "uosmo", amount: AMOUNT_IN },
    tokenOutMinAmount,
  );

  const res = await signer.client.signAndBroadcast(signer.address, [msg], "auto", "QUARK swap uosmo -> LVN");
  if (res.code !== 0) throw new Error(`Broadcast failed (code ${res.code}): ${res.rawLog}`);

  console.log(
    "SWAP_RESULT_JSON:" +
      JSON.stringify({
        txHash: res.transactionHash,
        height: res.height,
        estimatedOut: estimatedOut.toString(),
        mintscanUrl: `https://www.mintscan.io/osmosis/tx/${res.transactionHash}`,
      }),
  );
}

main().catch((e) => {
  console.error("SWAP_FAILED:", e?.message || String(e));
  process.exit(1);
});
