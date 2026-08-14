// SERVER-ONLY. Protocol treasury signer for Osmosis mainnet.
// Loads OSMO_TREASURY_MNEMONIC at call time (inside server fn .handler()).
// Never import from client modules or *.functions.ts module scope.

import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { SigningStargateClient, GasPrice, StargateClient } from "@cosmjs/stargate";
import { DEFAULT_RPC, GAS_PRICE, NATIVE_DENOM, MIN_GAS_BALANCE_OSMO } from "@/lib/cosmos/chain";

import { readLocalMnemonic } from "./status.server";

export interface ProtocolSigner {
  address: string;
  client: SigningStargateClient;
}

export class MissingTreasuryConfig extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "MissingTreasuryConfig";
  }
}

// The free public RPC (rpc.osmosis.zone) rate-limits and occasionally refuses
// new connections outright ("fetch failed"). Reusing one client across calls
// instead of reconnecting on every swap/mint/burn cuts connection volume
// dramatically; a short retry-with-backoff absorbs the rest of the flakiness.
let cachedSigner: ProtocolSigner | null = null;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectWithRetry(
  wallet: DirectSecp256k1HdWallet,
  registry: any,
  attempts = 3,
): Promise<SigningStargateClient> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await SigningStargateClient.connectWithSigner(DEFAULT_RPC, wallet, {
        registry,
        gasPrice: GasPrice.fromString(GAS_PRICE),
      });
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await sleep(500 * 2 ** i); // 500ms, 1s, ...
    }
  }
  const reason = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(
    `Could not connect to Osmosis RPC at ${DEFAULT_RPC} after ${attempts} attempts (${reason}). ` +
      `The free public endpoint rate-limits under load — set OSMO_RPC_URL to a paid provider ` +
      `(Polkachu, Numia, QuickNode) for reliable signing, or try again shortly.`,
  );
}

export async function getProtocolSigner(): Promise<ProtocolSigner> {
  if (cachedSigner) return cachedSigner;

  const mnemonic = readLocalMnemonic();
  if (!mnemonic) {
    throw new MissingTreasuryConfig(
      "OSMO_TREASURY_MNEMONIC is not configured. Create a .env file in the project root containing: OSMO_TREASURY_MNEMONIC=\"your 24 words here\"",
    );
  }
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: "osmo" });
  const [account] = await wallet.getAccounts();
  const { osmosisRegistry } = await import("@/lib/cosmos/registry");
  const client = await connectWithRetry(wallet, osmosisRegistry);
  cachedSigner = { address: account.address, client };
  return cachedSigner;
}

export async function readOnlyClient() {
  return StargateClient.connect(DEFAULT_RPC);
}

// Pre-flight check before any real broadcast: the treasury must hold enough
// native OSMO to pay gas, or every mint/send attempt fails mid-broadcast
// with a confusing "insufficient fee" chain error instead of a clear
// up-front message. Reuses the same balance-fetch pattern as
// treasury.functions.ts's getTreasuryBalance.
export async function hasSufficientGas(
  minOsmo = MIN_GAS_BALANCE_OSMO,
): Promise<{ ok: boolean; balanceOSMO: number }> {
  const mnemonic = readLocalMnemonic();
  if (!mnemonic) return { ok: false, balanceOSMO: 0 };

  const signer = await getProtocolSigner();
  const client = await readOnlyClient();
  try {
    const coin = await client.getBalance(signer.address, NATIVE_DENOM);
    const balanceOSMO = Number(coin.amount) / 1_000_000;
    return { ok: balanceOSMO >= minOsmo, balanceOSMO };
  } finally {
    client.disconnect();
  }
}
