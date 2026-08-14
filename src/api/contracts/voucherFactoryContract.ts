/**
 * voucherFactoryContract.ts
 * ---------------------------------------------------------------------
 * SIMULATED smart contract for a Token Factory–style reserve + transfer
 * ledger, covering both base tokens (OSMO, ATOM, ...) and vouchers
 * (vOSMO, vATOM, ...).
 *
 * This is written like a CosmWasm contract — `instantiate` / `execute` /
 * `query` entry points, an explicit contract address, its own reserve
 * ledger — but it is 100% simulated:
 *   - No real Token Factory denom is minted or transferred.
 *   - No message is ever broadcast to any chain.
 *   - Every transaction hash is a fake "SIM..." placeholder, matching the
 *     convention already used in simContract.ts and routes.ts.
 *
 * State:
 *   - reserve[token]     the supply the contract itself is holding,
 *                        not yet distributed to any address (populated
 *                        via `executeReserve`, a mint-to-self).
 *   - balances(address)  address balances, stored in the SAME
 *                        db.wallet_sessions table the rest of the app
 *                        already uses, so a `send` here immediately shows
 *                        up in the sender/recipient's normal wallet UI.
 *
 * This does NOT talk to real Osmosis Token Factory / bank module. For the
 * verified, real on-chain path see src/api/cosmos/*.server.ts and the
 * "Onchain" handlers in routes.ts.
 */

import { nanoid } from "nanoid";
import { db, type DBTransaction } from "../db";

// Fake, never-broadcast contract address — purely a label for txs/audit logs.
export const CONTRACT_ADDRESS = "osmo1sim0000000000000000voucherfactory";

// Generate a Cosmos-shaped 64-char uppercase hex hash, "SIM"-prefixed so it
// can never be confused with a real Osmosis tx hash.
function generateHash(): string {
  const chars = "0123456789ABCDEF";
  let hash = "SIM";
  for (let i = 0; i < 61; i++) hash += chars[Math.floor(Math.random() * 16)];
  return hash;
}

// Contract-held reserve, per token/voucher symbol. In-memory only (like the
// rest of simContract.ts) — reset on server restart, exactly like every
// other simulated ledger in this app.
const reserve: Record<string, number> = {};

// ---- internal ledger helpers -------------------------------------------

async function creditAddress(address: string, token: string, amount: number) {
  let session = await db.getWalletSessionByAddress(address);
  if (!session) {
    // Auto-provision a wallet session for a not-yet-seen address, same
    // behavior as adjustWalletBalanceByAddress in routes.ts, so a send/
    // reserve-payout to a brand new address doesn't silently no-op.
    session = await db.createWalletSession({
      id: "ws_" + nanoid(12),
      user_id: "contract_" + nanoid(6),
      provider: "keplr",
      address,
      balances: {},
      created_at: Date.now(),
      updated_at: Date.now(),
    });
  }
  const balances = { ...session.balances };
  balances[token] = (balances[token] ?? 0) + amount;
  await db.updateWalletSession(session.id, { balances });
  return balances[token];
}

async function debitAddress(address: string, token: string, amount: number) {
  const session = await db.getWalletSessionByAddress(address);
  const have = session?.balances?.[token] ?? 0;
  if (!session || have < amount) return null;
  const balances = { ...session.balances };
  balances[token] = have - amount;
  await db.updateWalletSession(session.id, { balances });
  return balances[token];
}

async function recordTx(
  fields: Partial<DBTransaction> & Pick<DBTransaction, "user_id" | "type" | "token" | "amount">,
) {
  const tx: DBTransaction = {
    id: "t_" + nanoid(12),
    hash: generateHash(),
    timestamp: Date.now(),
    status: "success",
    ...fields,
  } as DBTransaction;
  await db.createTransaction(tx);
  return tx;
}

async function audit(
  userId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  details: Record<string, any>,
) {
  await db.createAuditLog({
    id: "log_" + nanoid(12),
    user_id: userId,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    details,
    timestamp: Date.now(),
  });
}

// ---- execute: Reserve ----------------------------------------------------
// Admin-only "mint to self". Increases the contract's own reserve of
// `token` (base token OR voucher). Equivalent to a TokenFactory MsgMint
// where the recipient is the contract's own address, i.e. supply that
// exists but hasn't been handed out to anyone yet.
export async function executeReserve(adminId: string, token: string, amount: number) {
  if (!token) return { success: false, message: "Token is required" };
  if (!amount || amount <= 0) return { success: false, message: "Amount must be positive" };

  reserve[token] = (reserve[token] ?? 0) + amount;

  const tx = await recordTx({
    user_id: adminId,
    type: "mint",
    token,
    amount,
    to_address: CONTRACT_ADDRESS,
  });

  await audit(adminId, "CONTRACT_RESERVE", "reserve", token, {
    amount,
    newReserve: reserve[token],
  });

  return { success: true, transaction: tx, reserve: reserve[token] };
}

// ---- execute: Send --------------------------------------------------------
// Transfers `token` to `to`. Two modes, chosen by `from`:
//   - from === "reserve": admin-only payout straight out of the contract's
//     reserve (this is what an admin "airdrop" is — a reserve -> address
//     send). Fails if the reserve doesn't hold enough.
//   - from === <address>: a normal address -> address transfer. Fails if
//     the sender doesn't already hold at least `amount` at that address.
export async function executeSend(
  callerId: string,
  from: string,
  to: string,
  token: string,
  amount: number,
  opts: { isAdmin?: boolean } = {},
) {
  if (!token) return { success: false, message: "Token is required" };
  if (!to) return { success: false, message: "Recipient address is required" };
  if (!amount || amount <= 0) return { success: false, message: "Amount must be positive" };

  if (from === "reserve") {
    if (!opts.isAdmin) return { success: false, message: "Only an admin can send from the reserve" };
    if ((reserve[token] ?? 0) < amount) {
      return { success: false, message: "Insufficient contract reserve for this send" };
    }
    reserve[token] -= amount;
    const toBalance = await creditAddress(to, token, amount);

    const tx = await recordTx({
      user_id: callerId,
      type: "airdrop",
      token,
      amount,
      from_address: CONTRACT_ADDRESS,
      to_address: to,
    });

    await audit(callerId, "CONTRACT_SEND_FROM_RESERVE", "reserve", token, {
      to,
      amount,
      remainingReserve: reserve[token],
    });

    return { success: true, transaction: tx, reserve: reserve[token], toBalance };
  }

  const fromBalance = await debitAddress(from, token, amount);
  if (fromBalance === null) {
    return { success: false, message: "Insufficient balance at sender address" };
  }
  const toBalance = await creditAddress(to, token, amount);

  const tx = await recordTx({
    user_id: callerId,
    type: "send",
    token,
    amount,
    from_address: from,
    to_address: to,
  });

  await audit(callerId, "CONTRACT_SEND", "transfer", token, { from, to, amount });

  return { success: true, transaction: tx, fromBalance, toBalance };
}

// ---- query -----------------------------------------------------------------

export function queryReserve(token: string) {
  return { token, reserve: reserve[token] ?? 0 };
}

export function queryAllReserves() {
  return { ...reserve };
}

export async function queryBalance(address: string, token: string) {
  const session = await db.getWalletSessionByAddress(address);
  return { address, token, balance: session?.balances?.[token] ?? 0 };
}

export default {
  CONTRACT_ADDRESS,
  executeReserve,
  executeSend,
  queryReserve,
  queryAllReserves,
  queryBalance,
};
