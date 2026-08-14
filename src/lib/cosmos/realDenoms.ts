// Maps QUARK's base token symbols to the REAL, confirmed on-chain denom that
// backs each corresponding voucher. Only symbols listed here can go through
// the real escrow/delivery flow (user-signed MsgSend + treasury mint/burn/
// send). Everything else stays on the simulated/internal-ledger path —
// guessing a wrong denom for an unverified symbol would misdirect real funds.
//
// The KEY is the voucher's base symbol (voucher "vPEPE" -> key "PEPE"); the
// VALUE is the real underlying asset it is backed by / redeems into. These
// need not share a name — a voucher can be intentionally backed by a
// different real asset than its label suggests.
//
// - OSMO: the chain's native token, denom "uosmo", 6 decimals.
// - PEPE: there is NO canonical real "PEPE" on Osmosis (only dozens of
//   unrelated user-minted meme tokens). By design, the vPEPE voucher is
//   backed by real Levana LVN instead — so escrowing LVN mints vPEPE, and
//   redeeming vPEPE returns LVN. Denom confirmed from the treasury's actual
//   on-chain holdings; the "u" (micro) prefix denotes 6 decimals.
//
// Add more symbols here only once the exact on-chain denom is confirmed from
// the treasury's real balances via the LCD — never inferred from a name.
export interface RealDenom {
  denom: string;
  exponent: number;
  // Human-readable name of the real backing asset, for UI clarity when it
  // differs from the voucher's own label (e.g. vPEPE backed by "LVN").
  label: string;
}

const LVN_DENOM = "factory/osmo1mlng7pz4pnyxtpq0akfwall37czyk9lukaucsrn30ameplhhshtqdvfm5c/ulvn";

export const KNOWN_REAL_DENOMS: Record<string, RealDenom> = {
  OSMO: { denom: "uosmo", exponent: 6, label: "OSMO" },
  PEPE: { denom: LVN_DENOM, exponent: 6, label: "LVN" },
};

export function getRealDenom(symbol: string): RealDenom | null {
  if (!symbol) return null;
  const s = symbol.toUpperCase();
  if (KNOWN_REAL_DENOMS[s]) return KNOWN_REAL_DENOMS[s];
  // Vouchers are labelled "vX" for base symbol X, and different parts of the
  // app refer to the same thing as either "PEPE" or "vPEPE". Accept both,
  // otherwise a voucher stored as "vPEPE" silently finds no backing asset and
  // the whole redeem falls back to the simulated path with no visible reason.
  if (s.startsWith("V") && KNOWN_REAL_DENOMS[s.slice(1)]) return KNOWN_REAL_DENOMS[s.slice(1)];
  return null;
}

// Reverse lookup: given a real on-chain denom, return its friendly label
// (e.g. ".../ulvn" -> "LVN") so wallet balances don't surface as raw
// sub-denoms like "ulvn" in the UI.
export function labelForDenom(denom: string): string | null {
  const hit = Object.values(KNOWN_REAL_DENOMS).find((r) => r.denom === denom);
  return hit?.label ?? null;
}

export function toMicroUnits(humanAmount: number, exponent: number): string {
  return BigInt(Math.round(humanAmount * 10 ** exponent)).toString();
}

export function fromMicroUnits(microAmount: string | number, exponent: number): number {
  return Number(microAmount) / 10 ** exponent;
}
