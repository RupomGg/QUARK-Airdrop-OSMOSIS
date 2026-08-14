import { createServerFn } from "@tanstack/react-start";
import { readOnlyClient } from "./signer.server";
import { NATIVE_DENOM } from "@/lib/cosmos/chain";

import { readLocalMnemonic } from "./status.server";

export const getTreasuryBalance = createServerFn({ method: "GET" })
  .handler(async () => {
    console.log("[treasury] getTreasuryBalance called");

    const mnemonic = readLocalMnemonic();
    console.log("[treasury] mnemonic found:", mnemonic ? `yes (${mnemonic.split(" ").length} words)` : "NO");

    if (!mnemonic) {
      return {
        configured: false,
        address: null,
        balanceOSMO: 0,
        tokens: [],
        rpcError: null,
      };
    }

    // Derive address OFFLINE — no network needed, always succeeds if mnemonic is valid
    const { DirectSecp256k1HdWallet } = await import("@cosmjs/proto-signing");
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: "osmo" });
    const [account] = await wallet.getAccounts();
    const address = account.address;
    console.log("[treasury] derived address:", address);

    // Try to fetch live balance — if RPC is down/slow, still return configured:true
    let balanceOSMO = 0;
    let tokens: { denom: string; amount: number }[] = [];
    let rpcError: string | null = null;

    try {
      const client = await readOnlyClient();
      try {
        const allBalances = await client.getAllBalances(address);
        const native = allBalances.find((c) => c.denom === NATIVE_DENOM);
        balanceOSMO = native ? Number(native.amount) / 1_000_000 : 0;
        tokens = allBalances
          .filter((c) => c.denom !== NATIVE_DENOM)
          .map((c) => ({
            denom: c.denom,
            amount: Number(c.amount) / 1_000_000,
          }));
        console.log("[treasury] balance fetched:", balanceOSMO, "OSMO");
      } finally {
        client.disconnect();
      }
    } catch (err: any) {
      rpcError = err?.message || "RPC connection failed";
      console.warn("[treasury] RPC failed (balance unavailable):", rpcError);
    }

    return {
      configured: true,
      address,
      balanceOSMO,
      tokens,
      rpcError,
    };
  });
