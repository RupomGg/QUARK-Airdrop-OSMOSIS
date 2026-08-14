// Helpers for Osmosis Token Factory denoms.
// Format: factory/{creator_bech32}/{subdenom}

export function buildFactoryDenom(creator: string, subdenom: string): string {
  if (!creator) throw new Error("creator address required");
  const clean = subdenom.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
  if (!clean) throw new Error("subdenom must be alphanumeric");
  return `factory/${creator}/${clean}`;
}

export function parseFactoryDenom(denom: string): { creator: string; subdenom: string } | null {
  const parts = denom.split("/");
  if (parts.length !== 3 || parts[0] !== "factory") return null;
  return { creator: parts[1], subdenom: parts[2] };
}

export function isFactoryDenom(denom: string): boolean {
  return parseFactoryDenom(denom) !== null;
}

// Voucher subdenom convention: vSYMBOL -> subdenom "v{symbol}"
export function voucherSubdenom(symbol: string): string {
  const s = symbol.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
  return s.startsWith("v") ? s : `v${s}`;
}
