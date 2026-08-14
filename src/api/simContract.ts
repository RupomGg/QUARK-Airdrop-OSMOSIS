import { nanoid } from "nanoid";
import { db, type DBVoucher, type DBTransaction, type SupportedToken } from "./db";

type Token = SupportedToken;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Generate a Cosmos-compatible 64-char uppercase hex simulation hash.
// Real Osmosis tx hashes are 64 uppercase hex chars. We prefix with SIM
// so they're distinguishable from real hashes without breaking the format.
const generateHash = () => {
  const chars = "0123456789ABCDEF";
  let hash = "SIM";
  for (let i = 0; i < 61; i++) hash += chars[Math.floor(Math.random() * 16)];
  return hash;
};

const FEE = 0.003;

const tokenSupply: Record<string, number> = {
  OSMO: 1000000,
  ATOM: 1000000,
  PEPE: 1000000,
};
const voucherSupply: Record<string, number> = {
  vOSMO: 1000,
  vATOM: 1000,
  vPEPE: 1000,
};
const voucherReserve: Record<string, number> = {
  vOSMO: 1000,
  vATOM: 1000,
  vPEPE: 1000,
};
const voucherCollateral: Record<string, number> = {
  OSMO: 0,
  ATOM: 0,
  PEPE: 0,
};
// No seeded pools — a fake "vOSMO/vPEPE" demo entry here previously blocked
// real pool creation for that exact pair (sim.createPool's "already exists"
// check has no way to distinguish a decorative placeholder from a real
// pool), and re-appeared every time a server reload reset this module's
// state. Pools must be created explicitly via the admin create-pool flow,
// which checks the real chain before spending anything.
const pools: Record<string, { reserveA: number; reserveB: number }> = {};

function normalizePair(a: Token, b: Token) {
  return a < b ? `${a}/${b}` : `${b}/${a}`;
}

function getReserves(from: Token, to: Token) {
  const pair = normalizePair(from, to);
  const pool = pools[pair];
  if (!pool) return null;
  if (pair === `${from}/${to}`) {
    return { reserveIn: pool.reserveA, reserveOut: pool.reserveB, pair };
  }
  return { reserveIn: pool.reserveB, reserveOut: pool.reserveA, pair };
}

function updateReserves(from: Token, to: Token, newReserveIn: number, newReserveOut: number) {
  const pair = normalizePair(from, to);
  const pool = pools[pair];
  if (!pool) return;
  if (pair === `${from}/${to}`) {
    pool.reserveA = newReserveIn;
    pool.reserveB = newReserveOut;
  } else {
    pool.reserveA = newReserveOut;
    pool.reserveB = newReserveIn;
  }
}

export async function mintToken(userId: string, token: Token, amount: number) {
  const tx: DBTransaction = {
    id: "t_" + nanoid(12),
    user_id: userId,
    type: "mint",
    token,
    amount,
    hash: generateHash(),
    timestamp: Date.now(),
    status: "pending",
  };
  await db.createTransaction(tx);
  await db.createAuditLog({
    id: "log_" + nanoid(12),
    user_id: userId,
    action: "MINT",
    resource_type: "token",
    resource_id: token,
    details: { amount },
    timestamp: Date.now(),
  });
  await sleep(200);
  tokenSupply[token] += amount;
  tx.status = "success";
  return { success: true, transaction: tx, supply: tokenSupply[token] };
}

export async function burnToken(userId: string, token: Token, amount: number) {
  const tx: DBTransaction = {
    id: "t_" + nanoid(12),
    user_id: userId,
    type: "burn",
    token,
    amount,
    hash: generateHash(),
    timestamp: Date.now(),
    status: "pending",
  };
  await db.createTransaction(tx);
  await db.createAuditLog({
    id: "log_" + nanoid(12),
    user_id: userId,
    action: "BURN",
    resource_type: "token",
    resource_id: token,
    details: { amount },
    timestamp: Date.now(),
  });
  await sleep(200);
  tokenSupply[token] = Math.max(0, (tokenSupply[token] || 0) - amount);
  tx.status = "success";
  return { success: true, transaction: tx, supply: tokenSupply[token] };
}

export async function issueVoucher(userId: string, voucher: DBVoucher) {
  const created = await db.createVoucher(voucher);
  const tx: DBTransaction = {
    id: "t_" + nanoid(12),
    user_id: userId,
    type: "voucher",
    token: created.token,
    amount: created.amount,
    hash: generateHash(),
    timestamp: Date.now(),
    status: "pending",
  };
  await db.createTransaction(tx);

  const vToken = `v${created.token}`;
  if (voucherReserve[vToken] !== undefined) {
    voucherReserve[vToken] = Math.max(0, voucherReserve[vToken] - created.amount);
  }

  // Simulation only — do NOT mint real Token Factory tokens here. This used
  // to mint a real, un-escrowed voucher to the treasury on every call
  // whenever the treasury was configured, regardless of whether the user
  // actually had (or locked) any real backing — pure unbacked inflation of
  // the real on-chain supply, and its result wasn't even surfaced to callers
  // (handleCreateVoucher discards it). Real, backed minting now only
  // happens through handleCreateVoucherOnchain, which requires a verified
  // on-chain escrow transfer first.

  await db.createAuditLog({
    id: "log_" + nanoid(12),
    user_id: userId,
    action: "ISSUE_VOUCHER",
    resource_type: "voucher",
    resource_id: created.id,
    details: {
      code: created.code,
      amount: created.amount,
      token: created.token,
    },
    timestamp: Date.now(),
  });
  voucherCollateral[created.token] = (voucherCollateral[created.token] || 0) + created.amount;
  await sleep(50);
  tx.status = "success";
  return {
    success: true,
    voucher: created,
    transaction: tx,
  };
}

export async function redeemVoucher(userId: string, voucherId: string) {
  const voucher = await db.getVoucher(voucherId);
  if (!voucher) return { success: false, message: "Voucher not found" };
  const updated = await db.updateVoucher(voucherId, {
    status: "redeemed",
    redeemed_at: Date.now(),
  });
  const tx: DBTransaction = {
    id: "t_" + nanoid(12),
    user_id: userId,
    type: "redeem",
    token: voucher.token,
    amount: voucher.amount,
    hash: generateHash(),
    timestamp: Date.now(),
    status: "pending",
  };
  await db.createTransaction(tx);

  const vToken = `v${voucher.token}`;
  if (voucherReserve[vToken] !== undefined) {
    voucherReserve[vToken] = voucherReserve[vToken] + voucher.amount;
  }

  // Simulation only — do NOT burn real Token Factory tokens here. This used
  // to burn real treasury holdings on every simulated redeem whenever the
  // treasury was configured, with no connection to whether this specific
  // voucher's tokens were ever actually escrowed on-chain. Real, verified
  // burn+payout now only happens through handleRedeemVoucherOnchain.

  await db.createAuditLog({
    id: "log_" + nanoid(12),
    user_id: userId,
    action: "REDEEM_VOUCHER",
    resource_type: "voucher",
    resource_id: voucherId,
    details: {
      code: voucher.code,
      amount: voucher.amount,
      token: voucher.token,
    },
    timestamp: Date.now(),
  });
  voucherCollateral[voucher.token] = Math.max(
    0,
    (voucherCollateral[voucher.token] || 0) - voucher.amount,
  );
  await sleep(50);
  tx.status = "success";
  return {
    success: true,
    voucher: updated,
    transaction: tx,
  };
}

export async function airdropVoucher(
  adminId: string,
  toAddress: string,
  vToken: string,
  amount: number,
) {
  if (voucherReserve[vToken] < amount) {
    return { success: false, message: "Insufficient voucher reserve for airdrop" };
  }

  voucherReserve[vToken] -= amount;

  const userSession = await db.getWalletSessionByAddress(toAddress);

  if (userSession) {
    const balances = { ...userSession.balances };
    balances[vToken] = (balances[vToken] || 0) + amount;
    await db.updateWalletSession(userSession.id, { balances });
  }

  const tx: DBTransaction = {
    id: "t_" + nanoid(12),
    user_id: adminId,
    type: "airdrop",
    token: vToken as SupportedToken,
    amount,
    to_address: toAddress,
    hash: generateHash(),
    timestamp: Date.now(),
    status: "success",
  };
  await db.createTransaction(tx);

  await db.createAuditLog({
    id: "log_" + nanoid(12),
    user_id: adminId,
    action: "AIRDROP_VOUCHER",
    resource_type: "voucher",
    resource_id: vToken,
    details: { amount, toAddress },
    timestamp: Date.now(),
  });

  return { success: true, transaction: tx };
}

export async function mintReserveVoucher(adminId: string, vToken: string, amount: number) {
  voucherSupply[vToken] = (voucherSupply[vToken] || 0) + amount;
  voucherReserve[vToken] = (voucherReserve[vToken] || 0) + amount;

  await db.createAuditLog({
    id: "log_" + nanoid(12),
    user_id: adminId,
    action: "MINT_RESERVE_VOUCHER",
    resource_type: "reserve",
    resource_id: vToken,
    details: { amount },
    timestamp: Date.now(),
  });
  return { success: true, supply: voucherSupply[vToken], reserve: voucherReserve[vToken] };
}

export async function burnReserveVoucher(adminId: string, vToken: string, amount: number) {
  if ((voucherReserve[vToken] || 0) < amount) {
    return { success: false, message: "Insufficient reserve to burn" };
  }
  voucherSupply[vToken] = (voucherSupply[vToken] || 0) - amount;
  voucherReserve[vToken] = (voucherReserve[vToken] || 0) - amount;

  await db.createAuditLog({
    id: "log_" + nanoid(12),
    user_id: adminId,
    action: "BURN_RESERVE_VOUCHER",
    resource_type: "reserve",
    resource_id: vToken,
    details: { amount },
    timestamp: Date.now(),
  });
  return { success: true, supply: voucherSupply[vToken], reserve: voucherReserve[vToken] };
}

export async function generateVoucherConfig(
  adminId: string,
  token: string,
  symbol: string,
  decimals: number,
  supply: number,
) {
  const vToken = `v${token}`;

  // Seed base token if it doesn't exist
  if (tokenSupply[token] === undefined) {
    tokenSupply[token] = supply; // Initialize with the supply
  }
  if (voucherCollateral[token] === undefined) {
    voucherCollateral[token] = 0;
  }

  // Generate pools with all existing vouchers automatically
  const existingVouchers = Object.keys(voucherSupply).filter((v) => v !== vToken);
  for (const existing of existingVouchers) {
    const pair = normalizePair(vToken, existing);
    if (!pools[pair]) {
      // Initialize with 0 reserves (admin can add liquidity later)
      pools[pair] = { reserveA: 0, reserveB: 0 };
    }
  }

  voucherSupply[vToken] = supply;
  voucherReserve[vToken] = supply;

  await db.createAuditLog({
    id: "log_" + nanoid(12),
    user_id: adminId,
    action: "GENERATE_VOUCHER",
    resource_type: "generator",
    resource_id: vToken,
    details: { token, symbol, decimals, supply },
    timestamp: Date.now(),
  });
  return { success: true, vToken, supply };
}

export async function swapTokens(userId: string, from: Token, to: Token, amount: number) {
  // Enforce voucher only swaps
  if (!from.startsWith("v") || !to.startsWith("v")) {
    return { success: false, message: "Only voucher swaps are supported" };
  }

  const quote = getReserves(from, to);
  if (!quote) return { success: false, message: "Pool not found" };
  if (amount <= 0) return { success: false, message: "Invalid amount" };

  const amountInWithFee = amount * (1 - FEE);
  const numerator = amountInWithFee * quote.reserveOut;
  const denominator = quote.reserveIn + amountInWithFee;
  const amountOut = Number((numerator / denominator).toFixed(6));

  if (amountOut <= 0 || amountOut >= quote.reserveOut) {
    return { success: false, message: "Insufficient pool liquidity" };
  }

  const tx: DBTransaction = {
    id: "t_" + nanoid(12),
    user_id: userId,
    type: "swap",
    token: from,
    amount,
    from_token: from,
    to_token: to,
    hash: generateHash(),
    timestamp: Date.now(),
    status: "pending",
  };

  // Simulation only: the on-chain swap is executed once, by handleSwap in
  // routes.ts. Running it here as well double-executed every swap on mainnet.
  const newReserveIn = quote.reserveIn + amount;
  const newReserveOut = quote.reserveOut - amountOut;
  updateReserves(from, to, newReserveIn, newReserveOut);

  await db.createTransaction(tx);
  await db.createAuditLog({
    id: "log_" + nanoid(12),
    user_id: userId,
    action: "SWAP",
    resource_type: "pool",
    resource_id: `${from}/${to}`,
    details: { amount, amountOut },
    timestamp: Date.now(),
  });
  await sleep(50);
  tx.status = "success";
  return { success: true, transaction: tx, amountOut };
}

export async function addLiquidity(
  adminId: string,
  pair: string,
  amountA: number,
  amountB: number,
) {
  if (!pools[pair]) {
    return { success: false, message: "Pool not found" };
  }
  if (!pair.startsWith("v") || !pair.includes("/v")) {
    return { success: false, message: "Liquidity pools exist ONLY between vouchers" };
  }

  pools[pair].reserveA += amountA;
  pools[pair].reserveB += amountB;

  await db.createAuditLog({
    id: "log_" + nanoid(12),
    user_id: adminId,
    action: "ADD_LIQUIDITY",
    resource_type: "pool",
    resource_id: pair,
    details: { amountA, amountB },
    timestamp: Date.now(),
  });

  return { success: true, pool: pools[pair] };
}

export async function removeLiquidity(
  adminId: string,
  pair: string,
  amountA: number,
  amountB: number,
) {
  if (!pools[pair]) {
    return { success: false, message: "Pool not found" };
  }

  if (pools[pair].reserveA < amountA || pools[pair].reserveB < amountB) {
    return { success: false, message: "Insufficient pool liquidity" };
  }

  pools[pair].reserveA -= amountA;
  pools[pair].reserveB -= amountB;

  await db.createAuditLog({
    id: "log_" + nanoid(12),
    user_id: adminId,
    action: "REMOVE_LIQUIDITY",
    resource_type: "pool",
    resource_id: pair,
    details: { amountA, amountB },
    timestamp: Date.now(),
  });

  return { success: true, pool: pools[pair] };
}

// Normalizes any casing/prefix the admin types (e.g. "osmo/pepe",
// "VOSMO/VPEPE", "vosmo/vpepe") into the canonical "vSYMBOL" form used
// everywhere else in the app, and stores it under the SAME sorted key
// getReserves/updateReserves will later look up during a swap. Without this,
// the UI's blanket .toUpperCase() produced keys like "VOSMO/VPEPE" that
// always failed the "v"-prefix check below, and even a correctly-cased but
// differently-ordered pair (e.g. "vPEPE/vOSMO") would silently never be
// found by swaps, which always query the alphabetically-sorted key.
function toVoucherSymbol(raw: string): string {
  const base = /^v/i.test(raw) ? raw.slice(1) : raw;
  return `v${base.toUpperCase()}`;
}

export async function createPool(adminId: string, pair: string) {
  const parts = pair.split("/").map((s) => s.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { success: false, message: "Pair must be in the form vTOKEN/vTOKEN, e.g. vOSMO/vPEPE" };
  }
  const a = toVoucherSymbol(parts[0]);
  const b = toVoucherSymbol(parts[1]);
  if (a === b) {
    return { success: false, message: "Select two different tokens" };
  }
  const normalizedPair = normalizePair(a, b);

  if (pools[normalizedPair]) {
    return { success: false, message: "Pool already exists" };
  }
  pools[normalizedPair] = { reserveA: 0, reserveB: 0 };
  await db.createAuditLog({
    id: "log_" + nanoid(12),
    user_id: adminId,
    action: "CREATE_POOL",
    resource_type: "pool",
    resource_id: normalizedPair,
    details: {},
    timestamp: Date.now(),
  });
  return { success: true, pool: pools[normalizedPair], pair: normalizedPair };
}

export async function deletePool(adminId: string, pair: string) {
  if (!pools[pair]) {
    return { success: false, message: "Pool not found" };
  }
  delete pools[pair];
  await db.createAuditLog({
    id: "log_" + nanoid(12),
    user_id: adminId,
    action: "DELETE_POOL",
    resource_type: "pool",
    resource_id: pair,
    details: {},
    timestamp: Date.now(),
  });
  return { success: true };
}

export function getPoolReserves() {
  return {
    pools: { ...pools },
    supply: { ...tokenSupply },
    collateral: { ...voucherCollateral },
    voucherSupply: { ...voucherSupply },
    voucherReserve: { ...voucherReserve },
  };
}

export default {
  mintToken,
  burnToken,
  issueVoucher,
  redeemVoucher,
  swapTokens,
  getPoolReserves,
  airdropVoucher,
  mintReserveVoucher,
  burnReserveVoucher,
  generateVoucherConfig,
  addLiquidity,
  removeLiquidity,
  createPool,
  deletePool,
};
