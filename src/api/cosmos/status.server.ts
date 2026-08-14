// Decides whether on-chain Osmosis paths are available for protocol writes.
import fs from "node:fs";
import path from "node:path";

export function readLocalMnemonic(): string | null {
  if (typeof process === "undefined") return null;
  if (process.env?.OSMO_TREASURY_MNEMONIC) {
    console.log("[status.server] mnemonic loaded from process.env");
    return process.env.OSMO_TREASURY_MNEMONIC;
  }
  try {
    const envPath = path.join(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf8");
      // Match quoted value ("..." or '...') or unquoted value up to end of line
      const match = content.match(/OSMO_TREASURY_MNEMONIC\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\r\n]+))/);
      if (match) {
        const value = (match[1] ?? match[2] ?? match[3] ?? "").trim();
        if (value) {
          console.log("[status.server] mnemonic loaded from .env file ✓ (" + value.split(" ").length + " words)");
          return value;
        }
      }
      console.warn("[status.server] .env file found but OSMO_TREASURY_MNEMONIC not matched");
    } else {
      console.warn("[status.server] .env file not found at:", envPath);
    }
  } catch (e: any) {
    console.error("[status.server] error reading local .env file:", e?.message || e);
  }
  return null;
}

export function chainConfigured(): boolean {
  return Boolean(readLocalMnemonic());
}

export interface ChainStatus {
  configured: boolean;
  rpc: string;
  chainId: string;
  missing: string[];
}

export function getChainStatus(): ChainStatus {
  const missing: string[] = [];
  const env = typeof process !== "undefined" ? process.env || {} : {};
  const mnemonic = readLocalMnemonic();
  if (!mnemonic) missing.push("OSMO_TREASURY_MNEMONIC");
  if (!env.OSMO_RPC_URL) missing.push("OSMO_RPC_URL (recommended paid endpoint)");
  return {
    configured: !missing.includes("OSMO_TREASURY_MNEMONIC"),
    rpc: env.OSMO_RPC_URL || "https://rpc.osmosis.zone (public, rate-limited)",
    chainId: env.OSMO_CHAIN_ID || "osmosis-1",
    missing,
  };
}

