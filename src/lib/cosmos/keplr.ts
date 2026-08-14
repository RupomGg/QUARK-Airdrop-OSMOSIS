// Real Keplr integration for Osmosis Mainnet.
// All browser-only code; only call from event handlers / useEffect.
import { SigningStargateClient, StargateClient } from "@cosmjs/stargate";
import { GasPrice } from "@cosmjs/stargate";
import { DEFAULT_RPC, GAS_PRICE, OSMO_CHAIN_ID, getOsmosisKeplrChainInfo } from "./chain";

declare global {
  interface Window {
    keplr?: any;
    leap?: any;
    getOfflineSignerAuto?: any;
  }
}

export interface ConnectedKeplr {
  address: string;
  client: SigningStargateClient;
  chainId: string;
}

/** Detects Keplr; throws a user-friendly error if not installed. */
export function getKeplr() {
  if (typeof window === "undefined") throw new Error("Keplr is only available in the browser.");
  const keplr = window.keplr;
  if (!keplr) {
    throw new Error(
      "Keplr extension not found. Install Keplr at https://www.keplr.app/ and refresh.",
    );
  }
  return keplr;
}

/** Suggest Osmosis mainnet to Keplr (no-op if already added). */
export async function ensureOsmosisChain() {
  const keplr = getKeplr();
  try {
    if (keplr.experimentalSuggestChain) {
      await keplr.experimentalSuggestChain(getOsmosisKeplrChainInfo());
    }
  } catch {
    // mainnet is built into Keplr, suggestion may be ignored.
  }
}

/** Full connect flow: suggest chain, enable, build signing client. */
export async function connectKeplr(): Promise<ConnectedKeplr> {
  const keplr = getKeplr();
  await ensureOsmosisChain();
  await keplr.enable(OSMO_CHAIN_ID);

  const offlineSigner =
    (await keplr.getOfflineSignerAuto?.(OSMO_CHAIN_ID)) ||
    keplr.getOfflineSigner(OSMO_CHAIN_ID);
  const accounts = await offlineSigner.getAccounts();
  if (!accounts?.length) throw new Error("No Keplr accounts available.");

  const client = await SigningStargateClient.connectWithSigner(DEFAULT_RPC, offlineSigner, {
    gasPrice: GasPrice.fromString(GAS_PRICE),
  });

  return { address: accounts[0].address, client, chainId: OSMO_CHAIN_ID };
}

/** Read all on-chain balances (native + factory denoms) for an address. */
export async function readAllBalances(address: string) {
  const ro = await StargateClient.connect(DEFAULT_RPC);
  try {
    const coins = await ro.getAllBalances(address);
    return coins.map((c) => ({ denom: c.denom, amount: c.amount }));
  } finally {
    ro.disconnect();
  }
}

/** Read balance of a single denom. */
export async function readBalance(address: string, denom: string) {
  const ro = await StargateClient.connect(DEFAULT_RPC);
  try {
    const coin = await ro.getBalance(address, denom);
    return { denom: coin.denom, amount: coin.amount };
  } finally {
    ro.disconnect();
  }
}

/**
 * Sign and broadcast a real MsgSend from the connected Keplr account.
 * Used for real on-chain escrow (mint) and return (redeem) flows — the user
 * signs with their own key, moving their own real tokens; the server never
 * touches the user's funds directly.
 */
export async function sendViaKeplr(
  fromAddress: string,
  toAddress: string,
  amount: { denom: string; amount: string }[],
  memo = "",
): Promise<{ txHash: string; height: number }> {
  const keplr = getKeplr();
  await ensureOsmosisChain();
  await keplr.enable(OSMO_CHAIN_ID);

  const offlineSigner =
    (await keplr.getOfflineSignerAuto?.(OSMO_CHAIN_ID)) || keplr.getOfflineSigner(OSMO_CHAIN_ID);
  const client = await SigningStargateClient.connectWithSigner(DEFAULT_RPC, offlineSigner, {
    gasPrice: GasPrice.fromString(GAS_PRICE),
  });

  const res = await client.sendTokens(fromAddress, toAddress, amount, "auto", memo);
  if (res.code !== 0) {
    throw new Error(`Transfer failed (code ${res.code}): ${res.rawLog}`);
  }
  return { txHash: res.transactionHash, height: res.height };
}

/** Ask Keplr to add a factory denom to the wallet UI. */
export async function suggestToken(denom: string) {
  const keplr = getKeplr();
  if (keplr.suggestToken) {
    try {
      await keplr.suggestToken(OSMO_CHAIN_ID, denom);
    } catch {
      // user may have rejected; non-fatal.
    }
  }
}
