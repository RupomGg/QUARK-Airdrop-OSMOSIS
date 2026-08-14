// Validates a recipient is a real, well-formed Osmosis bech32 address before
// it's used in any real on-chain send — nothing in the app checked this
// before, so a typo or a wrong-chain address (e.g. an Ethereum "0x..." pasted
// into the admin form) would sail straight through to a real broadcast
// attempt and burn gas on a doomed (or worse, misdirected) transaction.
import { fromBech32 } from "@cosmjs/encoding";

export function isValidOsmoAddress(address: string): boolean {
  if (!address || typeof address !== "string") return false;
  try {
    const { prefix, data } = fromBech32(address.trim());
    // Osmosis account addresses are prefix "osmo" with a 20-byte payload.
    // Module/contract addresses are longer (32 bytes) and use the same
    // prefix — allow both since a Token Factory reserve payout could
    // legitimately target a contract address, but reject wrong-chain
    // prefixes (e.g. "cosmos1...", "juno1...") outright.
    return prefix === "osmo" && (data.length === 20 || data.length === 32);
  } catch {
    return false;
  }
}
