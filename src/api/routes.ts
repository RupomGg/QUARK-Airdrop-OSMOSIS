import { nanoid } from "nanoid";
import {
  signup,
  login,
  loginWithWallet,
  forgotPassword,
  resetPassword,
  logout as authLogout,
  verifySession,
  hashPassword,
} from "./auth";
import sim from "./simContract";
import * as voucherContract from "./contracts/voucherFactoryContract";
import {
  db,
  type DBWalletSession,
  type DBVoucher,
  type DBTransaction,
  type DBAuditLog,
} from "./db";

// Generate a Cosmos-compatible 64-char uppercase hex simulation hash.
const generateHash = (): string => {
  const chars = "0123456789ABCDEF";
  let hash = "SIM";
  for (let i = 0; i < 61; i++) hash += chars[Math.floor(Math.random() * 16)];
  return hash;
};

// Mintscan explorer base
const MINTSCAN_TX = (hash: string) => `https://www.mintscan.io/osmosis/tx/${hash}`;

// Sane upper bound on a single admin reserve/send amount — protects against
// a fat-fingered extra zero triggering a real, non-refundable mainnet mint
// or send far larger than intended.
const MAX_ADMIN_TOKEN_AMOUNT = 100_000;

const FEE_WALLET_ADDRESS = "TWrTCyTuUCA8KgKXVhDA9zqAHxSFjkmWcj"; // TRC20 Fee wallet
// Protocol fee on voucher swaps, charged on top of the pool's own swap fee.
// Set to 0 = disabled. Note the Osmosis GAMM pool ALSO charges its own 0.3%
// swap fee to liquidity providers; that one is part of the AMM itself and
// cannot be turned off here.
const FEE_PERCENTAGE = 0;

async function getWalletSession(userId: string): Promise<DBWalletSession | null> {
  return await db.getWalletSession(userId);
}

async function adjustWalletBalance(userId: string, token: string, delta: number) {
  const session = await getWalletSession(userId);
  if (!session) throw new Error("Wallet session not found");
  const balances = { ...session.balances };
  balances[token] = Math.max(0, (balances[token] ?? 0) + delta);
  return db.updateWalletSession(session.id, { balances });
}

async function adjustWalletBalanceByAddress(address: string, token: string, delta: number) {
  let session = await db.getWalletSessionByAddress(address);

  if (!session) {
    if (delta <= 0) return null;
    session = await db.createWalletSession({
      id: "ws_" + nanoid(12),
      user_id: "system_" + nanoid(6),
      provider: "keplr",
      address,
      balances: {},
      created_at: Date.now(),
      updated_at: Date.now(),
    });
  }

  const balances = { ...session.balances };
  balances[token] = Math.max(0, (balances[token] ?? 0) + delta);
  return db.updateWalletSession(session.id, { balances });
}

async function hasWalletBalance(userId: string, token: string, amount: number) {
  const session = await getWalletSession(userId);
  if (!session) return false;
  return (session.balances[token] ?? 0) >= amount;
}

async function getWalletAddress(userId: string) {
  const session = await getWalletSession(userId);
  return session?.address ?? "";
}

// Auth endpoints
export async function handleSignup(body: any) {
  // Never forward a client-supplied role — this is a public, unauthenticated
  // endpoint, and doing so let anyone POST {"role":"admin"} to instantly gain
  // full admin access (mint/burn, pool creation spending real treasury OSMO,
  // audit logs, everything). New accounts are always plain users; granting
  // admin requires a separate, protected action (e.g. an existing admin
  // promoting someone, or direct DB/Supabase access).
  return await signup({
    email: body.email,
    password: body.password,
    name: body.name || body.email.split("@")[0],
  });
}

export async function handleLogin(body: any) {
  return await login({
    email: body.email,
    password: body.password,
  });
}

export async function handleLoginWithWallet(body: any) {
  return await loginWithWallet(body.email, body.provider, body.address);
}

export async function handleForgotPassword(body: any) {
  return await forgotPassword(body.email);
}

export async function handleResetPassword(body: any) {
  return await resetPassword(body.token, body.password);
}

export async function handleLogout(body: any) {
  return await authLogout(body.sessionToken);
}

export async function handleVerifySession(sessionToken: string) {
  const result = await verifySession(sessionToken);
  if (!result.valid || !result.userId) return { valid: false };
  const user = await db.getUser(result.userId);
  return { valid: true, userId: result.userId, role: result.role, user };
}

// Voucher endpoints
export async function handleCreateVoucher(userId: string, body: any) {
  const { token, amount, note, swapSource } = body;
  const qty = Number(amount);
  if (!qty || qty <= 0) return { success: false, message: "Invalid voucher amount" };

  const wallet = await getWalletSession(userId);
  if (!wallet) return { success: false, message: "Wallet session required" };

  const isSwap = note === "Voucher swap result" || !!swapSource;

  if (!isSwap) {
    if ((wallet.balances[token] ?? 0) < qty) {
      return { success: false, message: "Insufficient wallet balance" };
    }
  } else if (swapSource) {
    if ((wallet.balances[swapSource.token] ?? 0) < swapSource.amount) {
      return { success: false, message: "Insufficient wallet balance for swap" };
    }
  }

  const voucher: DBVoucher = {
    id: "v_" + nanoid(12),
    code: `QRK-${nanoid(4).toUpperCase()}-${nanoid(4).toUpperCase()}`,
    token,
    amount: qty,
    owner_id: userId,
    status: "active",
    created_at: Date.now(),
    note,
  };

  if (!isSwap) {
    await adjustWalletBalance(userId, token, -qty);
  } else if (swapSource) {
    await adjustWalletBalance(userId, swapSource.token, -swapSource.amount);
  } else {
    // Fallback: If client has cached JS and didn't send swapSource, deduct the most recently redeemed voucher
    const userVouchers = await db.getUserVouchers(userId);
    const redeemed = userVouchers
      .filter((v) => v.status === "redeemed")
      .sort((a, b) => b.redeemed_at! - a.redeemed_at!);
    if (redeemed.length > 0) {
      const last = redeemed[0];
      await adjustWalletBalance(userId, last.token, -last.amount);
    }
  }

  const result = await sim.issueVoucher(userId, voucher);
  if (result && result.success) {
    return { success: true, voucher: result.voucher, transaction: result.transaction };
  }
  return { success: false, message: "Failed to issue voucher" };
}

export async function handleRedeemVoucher(userId: string, body: any) {
  const { voucherId } = body;
  if (!voucherId) return { success: false, message: "voucherId is required" };

  // See handleRedeemVoucherOnchain for why this claim must be taken before
  // any await: without it, two concurrent redeem calls for the same voucher
  // could both pass the status check below before either marks it redeemed.
  const { claim, release } = await import("./locks");
  const voucherLockKey = `voucher:${voucherId}`;
  if (!claim(voucherLockKey)) {
    return { success: false, message: "This voucher is already being redeemed." };
  }

  try {
    const voucher = await db.getVoucher(voucherId);
    if (!voucher) {
      return { success: false, message: "Voucher not found" };
    }

    const walletAddress = await getWalletAddress(userId);
    const isOwner = voucher.owner_id === userId;
    const isRecipient = voucher.transferred_to === walletAddress;

    if (!isOwner && !isRecipient) {
      return { success: false, message: "Not authorized to redeem this voucher" };
    }

    if (voucher.status !== "active" && voucher.status !== "transferred") {
      return { success: false, message: "Voucher cannot be redeemed" };
    }

    const res = await sim.redeemVoucher(userId, voucherId);
    if (!res || !res.success) {
      return { success: false, message: res?.message || "Redeem failed" };
    }

    // Real payout: if this voucher's token is backed by a real on-chain asset
    // (see KNOWN_REAL_DENOMS — e.g. PEPE is backed by LVN) and the user has a
    // connected wallet, pay the backing asset out of the treasury to their
    // address so the redemption is actually visible in Keplr.
    //
    // NOTE: this treats any redeemable voucher as a claim on the treasury,
    // including vouchers created from the simulated ledger. That is correct
    // for a treasury-owned demo, but in a public deployment it would let
    // anyone mint a simulated voucher and redeem it for real funds — hence
    // the explicit opt-in flag rather than defaulting on.
    const payoutEnabled = process.env.ALLOW_VOUCHER_REAL_PAYOUT === "true";
    let payout: { txHash?: string; denom?: string; label?: string; error?: string } = {};

    if (payoutEnabled && walletAddress) {
      const { getRealDenom, toMicroUnits } = await import("@/lib/cosmos/realDenoms");
      const real = getRealDenom(voucher.token);
      if (real) {
        try {
          const { chainConfigured } = await import("./cosmos/status.server");
          if (chainConfigured()) {
            const { sendFromTreasury } = await import("./cosmos/liquidity.server");
            const micro = toMicroUnits(voucher.amount, real.exponent);
            const sent = await sendFromTreasury(walletAddress, [
              { denom: real.denom, amount: micro },
            ]);
            payout = { txHash: sent.txHash, denom: real.denom, label: real.label };
            await db.createAuditLog({
              id: "log_" + nanoid(12),
              user_id: userId,
              action: "VOUCHER_REAL_PAYOUT",
              resource_type: "voucher",
              resource_id: voucherId,
              details: {
                token: voucher.token,
                amount: voucher.amount,
                paidDenom: real.denom,
                toAddress: walletAddress,
                txHash: sent.txHash,
              },
              timestamp: Date.now(),
            });
          }
        } catch (e: any) {
          payout.error = e?.message || String(e);
          console.error("[handleRedeemVoucher] real payout failed:", e);
        }
      }
    }

    // Only credit the internal ledger when no real asset was delivered —
    // otherwise the user would be paid twice (once in Keplr, once in-app).
    if (!payout.txHash) {
      await adjustWalletBalance(userId, voucher.token, voucher.amount);
    }

    return {
      success: true,
      voucher: res.voucher,
      transaction: res.transaction,
      payoutTxHash: payout.txHash,
      payoutAsset: payout.label,
      payoutError: payout.error,
      explorerUrl: payout.txHash ? MINTSCAN_TX(payout.txHash) : undefined,
    };
  } finally {
    release(voucherLockKey);
  }
}

// Real on-chain mint: the user must FIRST sign+broadcast a real MsgSend of
// the underlying token from their own Keplr wallet to the treasury (see
// sendViaKeplr on the client). This handler verifies that transfer actually
// happened on-chain, then mints the voucher factory-denom directly to the
// user's real address — so it lands in their Keplr, not just an internal
// ledger. Only symbols in KNOWN_REAL_DENOMS support this path.
export async function handleCreateVoucherOnchain(userId: string, body: any) {
  const { token, amount, escrowTxHash } = body;
  const qty = Number(amount);
  if (!qty || qty <= 0) return { success: false, message: "Invalid voucher amount" };
  if (!escrowTxHash) return { success: false, message: "escrowTxHash is required" };

  // Reserve the tx hash synchronously, before any `await`, so two concurrent
  // requests citing the same real escrow transaction can't both pass this
  // check and both mint a voucher backed by a single real transfer.
  const { reserveTxHash, releaseTxReservation, verifyBankSend, TxVerificationError } = await import(
    "./cosmos/txVerify.server"
  );
  if (!reserveTxHash(escrowTxHash)) {
    return { success: false, message: "This transaction has already been used." };
  }

  const { getRealDenom, toMicroUnits } = await import("@/lib/cosmos/realDenoms");
  const real = getRealDenom(token);
  if (!real) {
    releaseTxReservation(escrowTxHash);
    return { success: false, message: `${token} does not support real on-chain minting yet.` };
  }

  const wallet = await getWalletSession(userId);
  if (!wallet?.address) {
    releaseTxReservation(escrowTxHash);
    return { success: false, message: "Connect a wallet first" };
  }

  const { getProtocolSigner } = await import("./cosmos/signer.server");
  const signer = await getProtocolSigner();
  const microAmount = toMicroUnits(qty, real.exponent);

  try {
    await verifyBankSend({
      txHash: escrowTxHash,
      fromAddress: wallet.address,
      toAddress: signer.address,
      denom: real.denom,
      minAmount: microAmount,
    });
  } catch (e: any) {
    releaseTxReservation(escrowTxHash); // verification failed — allow a retry
    const msg = e instanceof TxVerificationError ? e.message : `Escrow verification failed: ${e?.message || e}`;
    return { success: false, message: msg };
  }
  // Verified: reservation stays permanent from here on, mint or no mint —
  // if minting fails below, the error message tells the user to contact
  // support rather than silently allowing a retry that could double-mint.

  const { voucherSubdenom, buildFactoryDenom } = await import("@/lib/cosmos/denom");
  const { mintToAddress } = await import("./cosmos/tokenFactory.server");
  const voucherDenom = buildFactoryDenom(signer.address, voucherSubdenom(token));

  let mintResult: { txHash: string; height: number };
  try {
    mintResult = await mintToAddress(voucherDenom, microAmount, wallet.address);
  } catch (e: any) {
    return {
      success: false,
      message: `Escrow received, but minting the voucher failed: ${e?.message || e}. Contact support with escrow tx ${escrowTxHash}.`,
    };
  }

  const voucher: DBVoucher = {
    id: "v_" + nanoid(12),
    code: `QRK-${nanoid(4).toUpperCase()}-${nanoid(4).toUpperCase()}`,
    token,
    amount: qty,
    owner_id: userId,
    status: "active",
    created_at: Date.now(),
    note: `On-chain mint: escrow ${escrowTxHash}`,
    onchain_escrow_tx: escrowTxHash,
    onchain_mint_tx: mintResult.txHash,
  };
  await db.createVoucher(voucher);
  // Real tokens actually left the user's wallet on-chain; keep the app's
  // cached balance display in sync until the next full wallet resync
  // (otherwise "Balance: X" would look frozen exactly like the earlier bug).
  await adjustWalletBalance(userId, token, -qty);

  const tx: DBTransaction = {
    id: "t_" + nanoid(12),
    user_id: userId,
    type: "voucher",
    token,
    amount: qty,
    hash: mintResult.txHash,
    timestamp: Date.now(),
    status: "success",
  };
  await db.createTransaction(tx);
  await db.createAuditLog({
    id: "log_" + nanoid(12),
    user_id: userId,
    action: "ONCHAIN_MINT",
    resource_type: "voucher",
    resource_id: voucher.id,
    details: { token, amount: qty, escrowTxHash, mintTxHash: mintResult.txHash },
    timestamp: Date.now(),
  });

  return {
    success: true,
    voucher,
    transaction: tx,
    escrowTxHash,
    mintTxHash: mintResult.txHash,
    mintscanUrl: MINTSCAN_TX(mintResult.txHash),
  };
}

// Real on-chain redemption counterpart to handleCreateVoucherOnchain: the
// user first sends their real voucher tokens back to the treasury, this
// verifies that transfer, then burns the received vouchers and sends the
// real underlying token back to the user from treasury holdings.
// Shared by handleRedeemVoucherOnchain (DBVoucher-backed) and
// handleRedeemWalletOnchain (raw wallet-balance-backed, no DBVoucher
// required) — the actual on-chain verification/burn/payout is identical
// either way; only how the caller establishes "this user owns this claim"
// differs. Callers MUST already hold the tx-hash reservation
// (reserveTxHash) before calling this — it is not re-claimed here, since
// that has to happen synchronously before ANY await in the caller itself
// (see the comment on reserveTxHash's call sites).
async function performOnchainRedeem(params: {
  userId: string;
  walletAddress: string;
  token: string;
  amount: number;
  returnTxHash: string;
}): Promise<
  | { success: true; sendTxHash: string; mintscanUrl: string }
  | { success: false; message: string }
> {
  const { userId, walletAddress, token, amount, returnTxHash } = params;

  const { releaseTxReservation, verifyBankSend, TxVerificationError } = await import("./cosmos/txVerify.server");
  const { getRealDenom, toMicroUnits } = await import("@/lib/cosmos/realDenoms");
  const real = getRealDenom(token);
  if (!real) return { success: false, message: `${token} does not support real on-chain redemption.` };

  const { getProtocolSigner } = await import("./cosmos/signer.server");
  const signer = await getProtocolSigner();
  const { voucherSubdenom, buildFactoryDenom } = await import("@/lib/cosmos/denom");
  const voucherDenom = buildFactoryDenom(signer.address, voucherSubdenom(token));
  const microAmount = toMicroUnits(amount, real.exponent);

  try {
    await verifyBankSend({
      txHash: returnTxHash,
      fromAddress: walletAddress,
      toAddress: signer.address,
      denom: voucherDenom,
      minAmount: microAmount,
    });
  } catch (e: any) {
    releaseTxReservation(returnTxHash); // verification failed — allow a retry
    const msg = e instanceof TxVerificationError ? e.message : `Return verification failed: ${e?.message || e}`;
    return { success: false, message: msg };
  }
  // Verified: the tx reservation stays permanent from here on regardless
  // of what happens next, to prevent a retry from paying out twice.

  const { burnFromTreasury } = await import("./cosmos/tokenFactory.server");
  const { sendFromTreasury } = await import("./cosmos/liquidity.server");

  try {
    await burnFromTreasury(voucherDenom, microAmount);
  } catch (e: any) {
    console.error(`[performOnchainRedeem] burn failed after verified return ${returnTxHash}:`, e);
    // Non-fatal: the voucher tokens are safely in treasury custody either
    // way; continue to pay the user back.
  }

  let sendResult: { txHash: string; height: number };
  try {
    sendResult = await sendFromTreasury(walletAddress, [{ denom: real.denom, amount: microAmount }]);
  } catch (e: any) {
    return {
      success: false,
      message: `${token} received and burned, but returning ${real.label} failed: ${e?.message || e}. Contact support with return tx ${returnTxHash}.`,
    };
  }

  await db.createTransaction({
    id: "t_" + nanoid(12),
    user_id: userId,
    type: "redeem",
    token,
    amount,
    hash: sendResult.txHash,
    timestamp: Date.now(),
    status: "success",
  });
  await db.createAuditLog({
    id: "log_" + nanoid(12),
    user_id: userId,
    action: "ONCHAIN_REDEEM",
    resource_type: "voucher",
    resource_id: token,
    details: { token, amount, returnTxHash, sendTxHash: sendResult.txHash },
    timestamp: Date.now(),
  });

  return { success: true, sendTxHash: sendResult.txHash, mintscanUrl: MINTSCAN_TX(sendResult.txHash) };
}

export async function handleRedeemVoucherOnchain(userId: string, body: any) {
  const { voucherId, returnTxHash } = body;
  if (!voucherId) return { success: false, message: "voucherId is required" };
  if (!returnTxHash) return { success: false, message: "returnTxHash is required" };

  // Claim the voucher AND the tx hash synchronously, before any `await`.
  // Without this, two concurrent requests for the same voucher (or two
  // requests citing the same real return transaction) could both pass the
  // status/consumed checks below before either one records its claim —
  // resulting in the treasury paying out real funds twice for one voucher.
  const { claim, release } = await import("./locks");
  const voucherLockKey = `voucher:${voucherId}`;
  if (!claim(voucherLockKey)) {
    return { success: false, message: "This voucher is already being redeemed." };
  }
  const { reserveTxHash } = await import("./cosmos/txVerify.server");
  if (!reserveTxHash(returnTxHash)) {
    release(voucherLockKey);
    return { success: false, message: "This transaction has already been used." };
  }

  try {
    const voucher = await db.getVoucher(voucherId);
    if (!voucher) return { success: false, message: "Voucher not found" };
    if (voucher.owner_id !== userId) return { success: false, message: "Not authorized to redeem this voucher" };
    if (voucher.status !== "active") return { success: false, message: "Voucher cannot be redeemed" };
    // Any voucher whose token has a real backing asset can be redeemed this
    // way — the safety here comes from verifying the user actually sent the
    // real voucher tokens back (below), not from how the voucher was
    // originally created. Requiring an escrow-mint marker instead blocked
    // legitimately-held voucher tokens from ever being redeemed.

    const wallet = await getWalletSession(userId);
    if (!wallet?.address) return { success: false, message: "Connect a wallet first" };

    const result = await performOnchainRedeem({
      userId,
      walletAddress: wallet.address,
      token: voucher.token,
      amount: voucher.amount,
      returnTxHash,
    });
    if (!result.success) return result;

    await db.updateVoucher(voucherId, { status: "redeemed", redeemed_at: Date.now() });
    // Mirror the real on-chain payout into the cached balance display, same
    // reasoning as the mint path above.
    await adjustWalletBalance(userId, voucher.token, voucher.amount);

    return {
      success: true,
      voucher: { ...voucher, status: "redeemed" },
      returnTxHash,
      sendTxHash: result.sendTxHash,
      mintscanUrl: result.mintscanUrl,
    };
  } finally {
    release(voucherLockKey);
  }
}

// Real on-chain redemption WITHOUT a pre-existing DBVoucher record — for
// voucher tokens that landed in the user's wallet some other way than the
// app's own escrow-mint flow (e.g. a direct admin airdrop via
// handleContractSend). The DBVoucher-based path above requires a DB row to
// track ownership/status; this path establishes ownership purely from the
// verified on-chain transfer instead (see performOnchainRedeem), which is
// the same guarantee the DBVoucher path actually relies on underneath.
export async function handleRedeemWalletOnchain(userId: string, body: any) {
  const { token, amount, returnTxHash } = body;
  const qty = Number(amount);
  if (!token) return { success: false, message: "token is required" };
  if (!qty || qty <= 0 || !Number.isFinite(qty)) return { success: false, message: "Invalid amount" };
  if (!returnTxHash) return { success: false, message: "returnTxHash is required" };

  // Reserve the tx hash synchronously, before any `await` — same reasoning
  // as handleRedeemVoucherOnchain: without this, two concurrent requests
  // citing the same real return transaction could both pass verification
  // before either records its claim.
  const { reserveTxHash, releaseTxReservation } = await import("./cosmos/txVerify.server");
  if (!reserveTxHash(returnTxHash)) {
    return { success: false, message: "This transaction has already been used." };
  }

  const wallet = await getWalletSession(userId);
  if (!wallet?.address) {
    releaseTxReservation(returnTxHash);
    return { success: false, message: "Connect a wallet first" };
  }

  const result = await performOnchainRedeem({
    userId,
    walletAddress: wallet.address,
    token,
    amount: qty,
    returnTxHash,
  });
  if (!result.success) return result;

  // Unlike handleRedeemVoucherOnchain, there is no prior internal-ledger
  // debit to reverse here — these voucher tokens never passed through the
  // app's own issue flow (they arrived via a direct admin airdrop or
  // similar), so the internal balance was never decremented for them.
  // Crediting it now would create a balance out of nowhere; the real payout
  // already landed on-chain in the user's actual wallet, which is the only
  // balance that matters for this path.

  return {
    success: true,
    returnTxHash,
    sendTxHash: result.sendTxHash,
    mintscanUrl: result.mintscanUrl,
  };
}

export async function handleTransferVoucher(userId: string, body: any) {
  const { voucherId, toAddress } = body;

  if (!toAddress) {
    return { success: false, message: "Recipient address is required" };
  }

  const voucher = await db.getVoucher(voucherId);
  if (!voucher) {
    return { success: false, message: "Voucher not found" };
  }

  if (voucher.owner_id !== userId) {
    return { success: false, message: "Not authorized to transfer this voucher" };
  }

  if (voucher.status !== "active") {
    return { success: false, message: "Voucher cannot be transferred" };
  }

  const updated = await db.updateVoucher(voucherId, {
    status: "transferred",
    transferred_to: toAddress,
  });

  const tx: DBTransaction = {
    id: "t_" + nanoid(12),
    user_id: userId,
    type: "transfer",
    token: voucher.token,
    amount: voucher.amount,
    to_address: toAddress,
    hash: generateHash(),
    timestamp: Date.now(),
    status: "success",
  };
  await db.createTransaction(tx);

  await db.createAuditLog({
    id: "log_" + nanoid(12),
    user_id: userId,
    action: "TRANSFER_VOUCHER",
    resource_type: "voucher",
    resource_id: voucherId,
    details: { toAddress, amount: voucher.amount },
    timestamp: Date.now(),
  });

  return { success: true, voucher: updated, transaction: tx };
}

export async function handleGetVouchers(userId: string) {
  const vouchers = await db.getUserVouchers(userId);
  return { success: true, vouchers };
}

// Transaction endpoints
export async function handleGetTransactions(userId: string) {
  const transactions = await db.getUserTransactions(userId);
  return { success: true, transactions };
}

export async function handleCreateTransaction(userId: string, body: any, role: string) {
  const { type, token, amount, fromToken, toToken, toAddress } = body;
  const qty = Number(amount);

  const wallet = await getWalletSession(userId);
  if (!wallet) return { success: false, message: "Wallet session required" };

  if (type === "swap") {
    if (!fromToken || !toToken) return { success: false, message: "Swap pair required" };
    if (fromToken === toToken) return { success: false, message: "Invalid pair" };
    if ((wallet.balances[fromToken] ?? 0) < qty)
      return { success: false, message: "Insufficient wallet balance" };
    const res = await sim.swapTokens(userId, fromToken, toToken, qty);
    if (!res || !res.success) return { success: false, message: res?.message || "Swap failed" };
    await adjustWalletBalance(userId, fromToken, -qty);
    await adjustWalletBalance(userId, toToken, res.amountOut ?? 0);
    return { success: true, transaction: res.transaction, amountOut: res.amountOut };
  }

  if (type === "send") {
    if (!toAddress) return { success: false, message: "Recipient is required" };
    if ((wallet.balances[token] ?? 0) < qty)
      return { success: false, message: "Insufficient wallet balance" };

    const feeAmount = qty * FEE_PERCENTAGE;
    const sendAmount = qty - feeAmount;

    await adjustWalletBalance(userId, token, -qty);
    await adjustWalletBalanceByAddress(toAddress, token, sendAmount);

    const tx: DBTransaction = {
      id: "t_" + nanoid(12),
      user_id: userId,
      type,
      token,
      amount: sendAmount,
      to_address: toAddress,
      hash: generateHash(),
      timestamp: Date.now(),
      status: "success",
    };
    const created = await db.createTransaction(tx);

    const feeTx: DBTransaction = {
      id: "t_" + nanoid(12),
      user_id: userId,
      type: "send",
      token,
      amount: feeAmount,
      to_address: FEE_WALLET_ADDRESS,
      hash: generateHash(),
      timestamp: Date.now(),
      status: "success",
    };
    await db.createTransaction(feeTx);
    await adjustWalletBalanceByAddress(FEE_WALLET_ADDRESS, token, feeAmount);

    await db.createAuditLog({
      id: "log_" + nanoid(12),
      user_id: userId,
      action: "SEND_TOKENS",
      resource_type: "transaction",
      resource_id: created.id,
      details: { toAddress, amount: sendAmount, feeAmount, token },
      timestamp: Date.now(),
    });
    return { success: true, transaction: created };
  }

  if (type === "mint" || type === "burn") {
    if (role !== "admin") return { success: false, message: "Admin privileges required" };
    if (!qty || qty <= 0) return { success: false, message: "Invalid amount" };
    const wallet = await getWalletSession(userId);
    if (!wallet) return { success: false, message: "Wallet session required" };
    if (type === "burn" && (wallet.balances[token] ?? 0) < qty) {
      return { success: false, message: "Insufficient wallet balance to burn" };
    }

    const res =
      type === "mint"
        ? await sim.mintToken(userId, token, qty)
        : await sim.burnToken(userId, token, qty);
    if (!res || !res.success)
      return { success: false, message: (res as any)?.message || `${type} failed` };

    await adjustWalletBalance(userId, token, type === "mint" ? qty : -qty);

    const tx: DBTransaction = {
      id: "t_" + nanoid(12),
      user_id: userId,
      type,
      token,
      amount: qty,
      hash: generateHash(),
      timestamp: Date.now(),
      status: "success",
    };
    const created = await db.createTransaction(tx);
    await db.createAuditLog({
      id: "log_" + nanoid(12),
      user_id: userId,
      action: type === "mint" ? "MINT_TOKEN" : "BURN_TOKEN",
      resource_type: "token",
      resource_id: token,
      details: { amount: qty },
      timestamp: Date.now(),
    });
    return { success: true, transaction: created };
  }

  const tx: DBTransaction = {
    id: "t_" + nanoid(12),
    user_id: userId,
    type,
    token,
    amount: qty,
    from_token: fromToken,
    to_token: toToken,
    to_address: toAddress,
    hash: generateHash(),
    timestamp: Date.now(),
    status: "success",
  };

  const created = await db.createTransaction(tx);
  await db.createAuditLog({
    id: "log_" + nanoid(12),
    user_id: userId,
    action: "CREATE_TRANSACTION",
    resource_type: "transaction",
    resource_id: created.id,
    details: { type, amount: qty, token },
    timestamp: Date.now(),
  });

  return { success: true, transaction: created };
}

// Wallet session endpoints
export async function handleSaveWalletSession(userId: string, body: any) {
  const { provider, address, balances } = body;

  const existing = await db.getWalletSession(userId);

  if (existing) {
    const updated = await db.updateWalletSession(existing.id, {
      provider,
      address,
      balances,
    });
    return { success: true, session: updated };
  }

  const session = await db.createWalletSession({
    id: "ws_" + nanoid(12),
    user_id: userId,
    provider,
    address,
    balances,
    created_at: Date.now(),
    updated_at: Date.now(),
  });

  return { success: true, session };
}

export async function handleGetWalletSession(userId: string) {
  const session = await db.getWalletSession(userId);
  if (!session) {
    return { success: false, message: "Wallet session required" };
  }
  return { success: true, session };
}

export async function handleGetContractStatus(userId: string) {
  const status: any = sim.getPoolReserves();

  // Layer in the treasury's REAL on-chain balances for known vouchers, so
  // the admin UI's "reserve" figures don't silently drift from what's
  // actually on Osmosis once Reserve/Send are broadcasting for real.
  try {
    const { chainConfigured, readLocalMnemonic } = await import("./cosmos/status.server");
    if (chainConfigured()) {
      // Derive the treasury address OFFLINE (no RPC needed) instead of going
      // through getProtocolSigner(), which opens a full SigningStargateClient
      // with its own connect-with-retry logic — much heavier than this needs
      // for a read-only balance display, and more likely to fail/time out on
      // the free public mainnet RPC under load. readOnlyClient() alone is
      // the same lightweight connection the Treasury page's balance check
      // already relies on successfully.
      const { DirectSecp256k1HdWallet } = await import("@cosmjs/proto-signing");
      const { readOnlyClient } = await import("./cosmos/signer.server");
      const wallet = await DirectSecp256k1HdWallet.fromMnemonic(readLocalMnemonic()!, { prefix: "osmo" });
      const [account] = await wallet.getAccounts();

      const client = await readOnlyClient();
      try {
        const balances = await client.getAllBalances(account.address);
        const prefix = `factory/${account.address}/`;
        const onchainReserve: Record<string, number> = {};
        for (const coin of balances) {
          if (!coin.denom.startsWith(prefix)) continue;
          const symbol = "v" + coin.denom.slice(prefix.length).replace(/^v/, "").toUpperCase();
          onchainReserve[symbol] = Number(coin.amount) / 1_000_000;
        }
        status.onchainReserve = onchainReserve;
        status.treasuryAddress = account.address;
      } finally {
        client.disconnect();
      }
    }
  } catch (e: any) {
    console.error("[handleGetContractStatus] onchain balance fetch failed:", e);
    status.onchainError = e?.message || String(e);
  }

  return { success: true, status };
}

// Audit log endpoints
export async function handleGetAuditLogs(userId: string, isAdmin: boolean) {
  const logs = isAdmin ? await db.getAuditLogs() : await db.getAuditLogs(userId);
  return { success: true, logs };
}

// Lending position endpoints
export async function handleCreateLendingPosition(userId: string, body: any) {
  const { token, type, amount } = body;
  const qty = Number(amount);
  if (!qty || qty <= 0) return { success: false, message: "Invalid amount" };

  const wallet = await getWalletSession(userId);
  if (!wallet) return { success: false, message: "Wallet session required" };

  if (type === "supply") {
    if ((wallet.balances[token] ?? 0) < qty)
      return { success: false, message: "Insufficient wallet balance" };
    await adjustWalletBalance(userId, token, -qty);
  }

  if (type === "borrow") {
    await adjustWalletBalance(userId, token, qty);
  }

  // Lending is disabled on the frontend ("Coming Soon"). APY is 0 until a real
  // money-market protocol (e.g. Mars) is wired in; no simulated rates.
  const apy = 0;

  const position = await db.createLendingPosition({
    id: "p_" + nanoid(12),
    user_id: userId,
    token,
    type,
    amount: qty,
    apy,
    created_at: Date.now(),
    updated_at: Date.now(),
  });

  const txType = type === "supply" ? "lend" : "borrow";
  const tx: DBTransaction = {
    id: "t_" + nanoid(12),
    user_id: userId,
    type: txType as any,
    token,
    amount: qty,
    hash: generateHash(),
    timestamp: Date.now(),
    status: "success",
  };
  await db.createTransaction(tx);

  await db.createAuditLog({
    id: "log_" + nanoid(12),
    user_id: userId,
    action: `CREATE_LENDING_${type.toUpperCase()}`,
    resource_type: "lending_position",
    resource_id: position.id,
    details: { token, amount: qty, apy },
    timestamp: Date.now(),
  });

  return { success: true, position, transaction: tx };
}

export async function handleGetLendingPositions(userId: string) {
  const positions = await db.getUserLendingPositions(userId);
  return { success: true, positions };
}

export async function handleCloseLendingPosition(userId: string, body: any) {
  const { positionId } = body;

  const position = await db.getLendingPosition(positionId);
  if (!position) {
    return { success: false, message: "Position not found" };
  }

  if (position.user_id !== userId) {
    return { success: false, message: "Not authorized" };
  }

  const wallet = await getWalletSession(userId);
  if (!wallet) {
    return { success: false, message: "Wallet session required" };
  }

  if (position.type === "supply") {
    await adjustWalletBalance(userId, position.token, position.amount);
  }

  if (position.type === "borrow") {
    if ((wallet.balances[position.token] ?? 0) < position.amount) {
      return { success: false, message: "Insufficient wallet balance to repay" };
    }
    await adjustWalletBalance(userId, position.token, -position.amount);
  }

  const txType = position.type === "supply" ? "redeem" : "repay";
  const tx: DBTransaction = {
    id: "t_" + nanoid(12),
    user_id: userId,
    type: txType as any,
    token: position.token,
    amount: position.amount,
    hash: generateHash(),
    timestamp: Date.now(),
    status: "success",
  };
  await db.createTransaction(tx);

  await db.createAuditLog({
    id: "log_" + nanoid(12),
    user_id: userId,
    action: `CLOSE_LENDING_${position.type.toUpperCase()}`,
    resource_type: "lending_position",
    resource_id: positionId,
    details: { amount: position.amount },
    timestamp: Date.now(),
  });

  await db.deleteLendingPosition(positionId);

  return { success: true, transaction: tx };
}

// Swap endpoints
export async function handleSwap(userId: string, body: any) {
  const { from, to, amount } = body;
  const qty = Number(amount);
  if (!qty || qty <= 0) return { success: false, message: "Invalid swap amount" };
  if (from === to) return { success: false, message: "Select two different tokens" };

  const wallet = await getWalletSession(userId);
  if (!wallet) return { success: false, message: "Wallet session required" };
  if ((wallet.balances[from] ?? 0) < qty)
    return { success: false, message: "Insufficient wallet balance" };

  const feeAmount = qty * FEE_PERCENTAGE;
  const swapAmount = qty - feeAmount;
  const slippagePct = Number(body.slippagePct) > 0 ? Number(body.slippagePct) : 1;

  // Execute the real on-chain swap FIRST (single execution point). If the
  // treasury is configured and the chain rejects the swap, the whole
  // operation fails — no balances move on a failed swap.
  let onchain: { txHash?: string; poolId?: string; mintscanUrl?: string; amountOut?: string } = {};
  const { chainConfigured } = await import("./cosmos/status.server");
  if (chainConfigured()) {
    try {
      const { getProtocolSigner } = await import("./cosmos/signer.server");
      const signer = await getProtocolSigner();
      const { swapVouchersOnChain } = await import("./cosmos/osmosisSwap.server");
      const result = await swapVouchersOnChain(signer.address, from, to, swapAmount, slippagePct);
      onchain = {
        txHash: result.txHash,
        poolId: result.poolId,
        mintscanUrl: result.mintscanUrl,
        amountOut: result.amountOut,
      };
    } catch (e: any) {
      return { success: false, message: `On-chain swap failed: ${e?.message || String(e)}` };
    }
  }

  const res = await sim.swapTokens(userId, from, to, swapAmount);
  if (!res || !res.success) {
    if (!onchain.txHash) return { success: false, message: res?.message || "Swap failed" };
    // On-chain swap already settled; don't fail the user because the local
    // simulation pool is out of sync. Record a transaction directly.
    console.warn(
      `[handleSwap] sim bookkeeping failed after on-chain success (${onchain.txHash}): ${res?.message}`,
    );
  }

  // Credit the user with what the chain actually paid out (micro-units → human).
  const amountOut = onchain.amountOut
    ? Number(onchain.amountOut) / 1_000_000
    : (res?.amountOut ?? 0);

  await adjustWalletBalance(userId, from, -qty);
  await adjustWalletBalance(userId, to, amountOut);

  let transaction = res?.transaction;
  if (transaction && onchain.txHash) {
    transaction.hash = onchain.txHash;
    await db.updateTransaction(transaction.id, { hash: onchain.txHash });
  } else if (!transaction) {
    transaction = {
      id: "t_" + nanoid(12),
      user_id: userId,
      type: "swap",
      token: from,
      amount: swapAmount,
      from_token: from,
      to_token: to,
      hash: onchain.txHash ?? generateHash(),
      timestamp: Date.now(),
      status: "success",
    };
    await db.createTransaction(transaction);
  }

  if (onchain.txHash) {
    await db.createAuditLog({
      id: "log_" + nanoid(12),
      user_id: userId,
      action: "ONCHAIN_SWAP",
      resource_type: "transaction",
      resource_id: transaction.id,
      details: {
        txHash: onchain.txHash,
        poolId: onchain.poolId,
        from,
        to,
        amount: swapAmount,
        amountOut,
      },
      timestamp: Date.now(),
    });
  }

  // Record fee transaction and credit fee wallet — skipped entirely when the
  // protocol fee is disabled, so no zero-value rows clutter the history.
  if (feeAmount > 0) {
    const feeTx: DBTransaction = {
      id: "t_" + nanoid(12),
      user_id: userId,
      type: "send",
      token: from,
      amount: feeAmount,
      to_address: FEE_WALLET_ADDRESS,
      hash: generateHash(),
      timestamp: Date.now(),
      status: "success",
    };
    await db.createTransaction(feeTx);
    await adjustWalletBalanceByAddress(FEE_WALLET_ADDRESS, from, feeAmount);
  }

  return {
    success: true,
    transaction,
    amountOut,
    onchainTxHash: onchain.txHash,
    poolId: onchain.poolId,
    mintscanUrl: onchain.mintscanUrl,
    explorerUrl: onchain.txHash ? MINTSCAN_TX(onchain.txHash) : undefined,
  };
}

// Atomic voucher→voucher swap: swap + redeem source voucher + issue target
// voucher in one server call, so a mid-sequence failure can't strand the user
// (previously the client fired three separate API calls).
export async function handleSwapVoucher(userId: string, body: any) {
  const { voucherId, toToken, slippagePct } = body;
  if (!voucherId) return { success: false, message: "voucherId is required" };
  if (!toToken) return { success: false, message: "toToken is required" };

  // See handleRedeemVoucherOnchain for why this claim must be taken before
  // any await: without it, two concurrent swap calls for the same voucher
  // could both pass the status check below and both trigger a real on-chain
  // swap against one voucher.
  const { claim, release } = await import("./locks");
  const voucherLockKey = `voucher:${voucherId}`;
  if (!claim(voucherLockKey)) {
    return { success: false, message: "This voucher is already being swapped." };
  }

  try {
    const voucher = await db.getVoucher(voucherId);
    if (!voucher) return { success: false, message: "Voucher not found" };
    if (voucher.owner_id !== userId)
      return { success: false, message: "Not authorized to swap this voucher" };
    if (voucher.status !== "active") return { success: false, message: "Voucher is not active" };
    if (voucher.token === toToken)
      return { success: false, message: "Select a different target token" };

    const wallet = await getWalletSession(userId);
    if (!wallet) return { success: false, message: "Wallet session required" };

    // 1. Release the voucher's value into the wallet so handleSwap's balance
    //    check and debit operate on it, then swap (on-chain when configured).
    await adjustWalletBalance(userId, `v${voucher.token}`, voucher.amount);
    const swapResult = await handleSwap(userId, {
      from: `v${voucher.token}`,
      to: `v${toToken}`,
      amount: voucher.amount,
      slippagePct,
    });
    if (!swapResult.success) {
      await adjustWalletBalance(userId, `v${voucher.token}`, -voucher.amount);
      return swapResult;
    }
    // Move the swap output out of the loose wallet balance into the new voucher.
    await adjustWalletBalance(userId, `v${toToken}`, -(swapResult.amountOut ?? 0));

    // 2. Retire the source voucher
    await db.updateVoucher(voucherId, { status: "redeemed", redeemed_at: Date.now() });

    // 3. Issue the target voucher for the actual swap output
    const newVoucher: DBVoucher = {
      id: "v_" + nanoid(12),
      code: `QRK-${nanoid(4).toUpperCase()}-${nanoid(4).toUpperCase()}`,
      token: toToken,
      amount: swapResult.amountOut ?? 0,
      owner_id: userId,
      status: "active",
      created_at: Date.now(),
      note: `Voucher swap from v${voucher.token} (${swapResult.onchainTxHash ?? "sim"})`,
    };
    await db.createVoucher(newVoucher);

    await db.createAuditLog({
      id: "log_" + nanoid(12),
      user_id: userId,
      action: "VOUCHER_SWAP",
      resource_type: "voucher",
      resource_id: voucherId,
      details: {
        fromToken: voucher.token,
        toToken,
        amountIn: voucher.amount,
        amountOut: swapResult.amountOut,
        newVoucherId: newVoucher.id,
        onchainTxHash: swapResult.onchainTxHash,
      },
      timestamp: Date.now(),
    });

    return {
      success: true,
      voucher: newVoucher,
      redeemedVoucherId: voucherId,
      amountOut: swapResult.amountOut,
      transaction: swapResult.transaction,
      onchainTxHash: swapResult.onchainTxHash,
      poolId: swapResult.poolId,
      mintscanUrl: swapResult.mintscanUrl,
      explorerUrl: swapResult.explorerUrl,
    };
  } finally {
    release(voucherLockKey);
  }
}

// Real on-chain voucher→voucher swap: the user must FIRST sign+broadcast a
// real MsgSend of their source voucher tokens to the treasury (mirrors
// handleCreateVoucherOnchain's escrow step). This handler verifies that
// transfer, executes the real DEX swap against the source/target voucher
// pool, and sends the real resulting tokens back to the user's own address —
// so both sides actually move in the user's wallet, not just the internal
// ledger. Only usable for vouchers that were themselves delivered on-chain
// (voucher.onchain_mint_tx set); anything else has no real tokens in the
// user's wallet to escrow in the first place, so falls back to
// handleSwapVoucher.
export async function handleSwapVoucherOnchain(userId: string, body: any) {
  const { voucherId, toToken, escrowTxHash, slippagePct } = body;
  if (!voucherId) return { success: false, message: "voucherId is required" };
  if (!toToken) return { success: false, message: "toToken is required" };
  if (!escrowTxHash) return { success: false, message: "escrowTxHash is required" };

  const { claim, release } = await import("./locks");
  const voucherLockKey = `voucher:${voucherId}`;
  if (!claim(voucherLockKey)) {
    return { success: false, message: "This voucher is already being swapped." };
  }
  const { reserveTxHash, releaseTxReservation, verifyBankSend, TxVerificationError } = await import(
    "./cosmos/txVerify.server"
  );
  if (!reserveTxHash(escrowTxHash)) {
    release(voucherLockKey);
    return { success: false, message: "This transaction has already been used." };
  }

  try {
    const voucher = await db.getVoucher(voucherId);
    if (!voucher) return { success: false, message: "Voucher not found" };
    if (voucher.owner_id !== userId) return { success: false, message: "Not authorized to swap this voucher" };
    if (voucher.status !== "active") return { success: false, message: "Voucher is not active" };
    if (voucher.token === toToken) return { success: false, message: "Select a different target token" };
    if (!voucher.onchain_mint_tx) {
      return { success: false, message: "This voucher was not delivered on-chain; use the standard swap instead." };
    }

    const wallet = await getWalletSession(userId);
    if (!wallet?.address) return { success: false, message: "Connect a wallet first" };

    const { getProtocolSigner } = await import("./cosmos/signer.server");
    const signer = await getProtocolSigner();
    const { voucherSubdenom, buildFactoryDenom } = await import("@/lib/cosmos/denom");
    const { toMicroUnits } = await import("@/lib/cosmos/realDenoms");
    const sourceDenom = buildFactoryDenom(signer.address, voucherSubdenom(voucher.token));
    const destDenom = buildFactoryDenom(signer.address, voucherSubdenom(toToken));
    const microAmountIn = toMicroUnits(voucher.amount, 6);

    try {
      await verifyBankSend({
        txHash: escrowTxHash,
        fromAddress: wallet.address,
        toAddress: signer.address,
        denom: sourceDenom,
        minAmount: microAmountIn,
      });
    } catch (e: any) {
      releaseTxReservation(escrowTxHash); // verification failed — allow a retry
      const msg = e instanceof TxVerificationError ? e.message : `Escrow verification failed: ${e?.message || e}`;
      return { success: false, message: msg };
    }
    // Verified: reservation stays permanent from here on.

    const { swapOnOsmosis } = await import("./cosmos/osmosisSwap.server");
    let swapResult: Awaited<ReturnType<typeof swapOnOsmosis>>;
    try {
      swapResult = await swapOnOsmosis(sourceDenom, destDenom, microAmountIn, Number(slippagePct) || 1);
    } catch (e: any) {
      // The user's real tokens already landed in the treasury; refund them
      // since we couldn't complete the swap, rather than leaving the user
      // short with nothing to show for it.
      const { sendFromTreasury } = await import("./cosmos/liquidity.server");
      try {
        await sendFromTreasury(wallet.address, [{ denom: sourceDenom, amount: microAmountIn }]);
        return { success: false, message: `Swap failed (${e?.message || e}) — your ${voucher.token} has been refunded to your wallet.` };
      } catch (refundErr: any) {
        return {
          success: false,
          message: `Swap failed and refund also failed: ${refundErr?.message || refundErr}. Contact support with escrow tx ${escrowTxHash}.`,
        };
      }
    }

    const { sendFromTreasury } = await import("./cosmos/liquidity.server");
    let sendResult: { txHash: string; height: number };
    try {
      sendResult = await sendFromTreasury(wallet.address, [{ denom: destDenom, amount: swapResult.amountOut }]);
    } catch (e: any) {
      return {
        success: false,
        message: `Swap succeeded, but delivering ${toToken} failed: ${e?.message || e}. Contact support with swap tx ${swapResult.txHash}.`,
      };
    }

    await db.updateVoucher(voucherId, { status: "redeemed", redeemed_at: Date.now() });
    const amountOutHuman = Number(swapResult.amountOut) / 1_000_000;
    const newVoucher: DBVoucher = {
      id: "v_" + nanoid(12),
      code: `QRK-${nanoid(4).toUpperCase()}-${nanoid(4).toUpperCase()}`,
      token: toToken,
      amount: amountOutHuman,
      owner_id: userId,
      status: "active",
      created_at: Date.now(),
      note: `On-chain swap from v${voucher.token}: escrow ${escrowTxHash}, swap ${swapResult.txHash}`,
      onchain_escrow_tx: escrowTxHash,
      onchain_mint_tx: sendResult.txHash,
    };
    await db.createVoucher(newVoucher);

    await db.createAuditLog({
      id: "log_" + nanoid(12),
      user_id: userId,
      action: "ONCHAIN_VOUCHER_SWAP",
      resource_type: "voucher",
      resource_id: voucherId,
      details: {
        fromToken: voucher.token,
        toToken,
        amountIn: voucher.amount,
        amountOut: amountOutHuman,
        escrowTxHash,
        swapTxHash: swapResult.txHash,
        sendTxHash: sendResult.txHash,
        poolId: swapResult.poolId,
      },
      timestamp: Date.now(),
    });

    return {
      success: true,
      voucher: newVoucher,
      redeemedVoucherId: voucherId,
      amountOut: amountOutHuman,
      escrowTxHash,
      swapTxHash: swapResult.txHash,
      sendTxHash: sendResult.txHash,
      poolId: swapResult.poolId,
      mintscanUrl: MINTSCAN_TX(sendResult.txHash),
    };
  } finally {
    release(voucherLockKey);
  }
}

// Osmosis DEX Pool query endpoint
export async function handleGetOsmosisPools() {
  try {
    const { chainConfigured } = await import("./cosmos/status.server");
    const configured = chainConfigured();

    // The pool query only needs the public treasury address, not the signer.
    let treasuryAddress = process.env.VITE_TREASURY_ADDRESS || "";
    if (!treasuryAddress && configured) {
      const { getProtocolSigner } = await import("./cosmos/signer.server");
      const signer = await getProtocolSigner();
      treasuryAddress = signer.address;
    }

    const { checkLcdReachable, queryFactoryPools } = await import("./cosmos/osmosisLcd.server");
    const lcdReachable = await checkLcdReachable();

    if (!lcdReachable) {
      return {
        success: false,
        message: "Osmosis LCD is not reachable. Check your network connection.",
        lcdReachable: false,
        pools: [],
      };
    }

    const pools = treasuryAddress ? await queryFactoryPools(treasuryAddress) : [];

    return {
      success: true,
      lcdReachable,
      configured,
      treasuryAddress: treasuryAddress || null,
      pools,
      message:
        pools.length === 0
          ? configured
            ? "No DEX pools found for your treasury's factory denoms yet. Create a pool on app.osmosis.zone."
            : "Treasury not configured. Set VITE_TREASURY_ADDRESS or OSMO_TREASURY_MNEMONIC to query factory pools."
          : `Found ${pools.length} pool(s) on Osmosis DEX.`,
    };
  } catch (e: any) {
    return { success: false, message: e?.message || "Failed to query Osmosis pools", pools: [] };
  }
}

export async function handleDebugBootstrap(body: any) {
  if (process.env.NODE_ENV === "production") {
    return { success: false, message: "Debug bootstrap is disabled in production." };
  }

  const adminEmail = body.adminEmail || "oyetofun@gmail.com";
  const walletEmail = body.walletEmail || "keplr-osmo1-test";
  const walletAddress = body.walletAddress || "osmo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
  const bonuses = body.balances || { OSMO: 50, vOSMO: 100, vVTEST: 100 };

  const adminPassword = body.adminPassword || "Tofunmi@12345";
  let adminUser = await db.getUserByEmail(adminEmail);
  if (!adminUser) {
    adminUser = await db.createUser({
      id: "u_" + nanoid(12),
      email: adminEmail,
      name: "Admin",
      address: "",
      password_hash: hashPassword(adminPassword),
      role: "admin",
      provider: null,
      connected: false,
      created_at: Date.now(),
      updated_at: Date.now(),
    });
  } else {
    adminUser =
      (await db.updateUser(adminUser.id, {
        role: "admin",
        password_hash: hashPassword(adminPassword),
        updated_at: Date.now(),
      })) || adminUser;
  }

  let walletUser = await db.getUserByEmail(walletEmail);
  if (!walletUser) {
    walletUser = await db.createUser({
      id: "u_" + nanoid(12),
      email: walletEmail,
      name: walletEmail.split("@")[0],
      address: walletAddress,
      role: "user",
      provider: "keplr",
      connected: true,
      created_at: Date.now(),
      updated_at: Date.now(),
    });
  } else {
    walletUser =
      (await db.updateUser(walletUser.id, {
        provider: "keplr",
        address: walletAddress,
        connected: true,
        updated_at: Date.now(),
      })) || walletUser;
  }

  let walletSession = await db.getWalletSession(walletUser.id);
  if (!walletSession) {
    walletSession = await db.createWalletSession({
      id: "ws_" + nanoid(12),
      user_id: walletUser.id,
      provider: "keplr",
      address: walletAddress,
      balances: bonuses,
      created_at: Date.now(),
      updated_at: Date.now(),
    });
  } else {
    walletSession =
      (await db.updateWalletSession(walletSession.id, {
        balances: { ...walletSession.balances, ...bonuses },
        provider: "keplr",
        address: walletAddress,
        updated_at: Date.now(),
      })) || walletSession;
  }

  await sim.generateVoucherConfig(adminUser.id, "OSMO", "OSMO", 6, 1000).catch(() => null);
  await sim.generateVoucherConfig(adminUser.id, "VTEST", "VTEST", 6, 1000).catch(() => null);
  await sim.createPool(adminUser.id, "vOSMO/vVTEST").catch(() => null);
  await sim.addLiquidity(adminUser.id, "vOSMO/vVTEST", 1000, 1000).catch(() => null);

  const walletSessionToken = nanoid(32);
  await db.createSession({
    token: walletSessionToken,
    user_id: walletUser.id,
    role: "user",
    expires_at: Date.now() + 7 * 24 * 60 * 60 * 1000,
    created_at: Date.now(),
  });

  const adminSessionToken = nanoid(32);
  await db.createSession({
    token: adminSessionToken,
    user_id: adminUser.id,
    role: "admin",
    expires_at: Date.now() + 7 * 24 * 60 * 60 * 1000,
    created_at: Date.now(),
  });

  return {
    success: true,
    adminSessionToken,
    walletSessionToken,
    walletAddress,
    walletBalances: walletSession.balances,
    pool: { pair: "vOSMO/vVTEST", amountA: 100, amountB: 100 },
  };
}

// Check external explorer reachability from the server side.
export async function handleCheckExplorer(body: any) {
  const address = body?.address;
  if (!address) return { success: false, message: "address is required" };

  const urls = [
    `https://www.mintscan.io/osmosis/address/${address}`,
    `https://mintscan.io/osmosis/address/${address}`,
    `https://www.mintscan.io/osmosis/account/${address}`,
  ];

  const results: Record<string, boolean> = {};
  for (const u of urls) {
    try {
      const res = await fetch(u, { method: "HEAD" });
      results[u] = res.ok;
    } catch (e) {
      results[u] = false;
    }
  }

  return { success: true, results };
}

// Admin Endpoints
export async function handleMintReserve(userId: string, body: any) {
  const { vToken, amount } = body;
  const qty = Number(amount);
  if (!qty || qty <= 0) return { success: false, message: "Invalid amount" };
  const res = await sim.mintReserveVoucher(userId, vToken, qty);
  return res;
}

export async function handleBurnReserve(userId: string, body: any) {
  const { vToken, amount } = body;
  const qty = Number(amount);
  if (!qty || qty <= 0) return { success: false, message: "Invalid amount" };
  const res = await sim.burnReserveVoucher(userId, vToken, qty);
  return res;
}

export async function handleGenerateVoucher(userId: string, body: any) {
  const { token, symbol, decimals, supply } = body;
  if (!token || !supply) return { success: false, message: "Token and supply required" };
  const res = await sim.generateVoucherConfig(userId, token, symbol, decimals, supply);
  return res;
}

export async function handleAirdrop(userId: string, body: any) {
  const { toAddress, vToken, amount } = body;
  const qty = Number(amount);
  if (!qty || qty <= 0 || !toAddress || !vToken)
    return { success: false, message: "Invalid airdrop parameters" };
  const res = await sim.airdropVoucher(userId, toAddress, vToken, qty);
  return res;
}

// --- Simulated smart contract endpoints (reserve + send, TokenFactory) ---

// Admin "Reserve": mints INTO the treasury's own on-chain holdings whenever
// the token is a real, already-created Token Factory denom (vOSMO/vPEPE
// today); falls back to the simulated-only ledger for tokens that don't
// exist on-chain yet. The simulated bookkeeping in voucherContract.executeReserve
// always runs first (same layering handleCreatePool uses for sim.createPool
// + a real on-chain step) so the admin UI's "reserve" counter stays in sync
// even when the real path is skipped or fails.
export async function handleContractReserve(userId: string, body: any) {
  const { token, amount } = body;
  const qty = Number(amount);
  if (!token || !qty || qty <= 0)
    return { success: false, message: "Token and a positive amount are required" };
  if (!Number.isFinite(qty) || qty > MAX_ADMIN_TOKEN_AMOUNT) {
    return { success: false, message: `Amount must be a finite number no greater than ${MAX_ADMIN_TOKEN_AMOUNT}` };
  }

  const res = await voucherContract.executeReserve(userId, token, qty);
  if (!res.success) return res;

  // Real-money guard: two concurrent "Reserve" clicks for the same token
  // must not both mint on-chain — claim synchronously before any await.
  const { claim, release } = await import("./locks");
  const reserveKey = `contract-reserve:${token}`;
  if (!claim(reserveKey)) {
    return { ...res, onchainError: "A reserve mint for this token is already in progress." };
  }

  try {
    const { chainConfigured } = await import("./cosmos/status.server");
    if (!chainConfigured()) return res;

    const { getProtocolSigner, hasSufficientGas } = await import("./cosmos/signer.server");
    const { buildFactoryDenom, voucherSubdenom } = await import("@/lib/cosmos/denom");
    const { denomExistsForCreator } = await import("./cosmos/osmosisLcd.server");
    const { mintToAddress } = await import("./cosmos/tokenFactory.server");
    const { toMicroUnits } = await import("@/lib/cosmos/realDenoms");

    const signer = await getProtocolSigner();
    const denom = buildFactoryDenom(signer.address, voucherSubdenom(token));

    const exists = await denomExistsForCreator(denom, signer.address);
    if (!exists) {
      return { ...res, onchainError: `${token} has no real Token Factory denom on-chain yet — reserved in simulation only.` };
    }

    const gas = await hasSufficientGas();
    if (!gas.ok) {
      return { ...res, onchainError: `Treasury needs funding for gas (has ${gas.balanceOSMO} OSMO) — reserved in simulation only.` };
    }

    const microAmount = toMicroUnits(qty, 6);
    const mintResult = await mintToAddress(denom, microAmount, signer.address);

    if (res.transaction) {
      res.transaction.hash = mintResult.txHash;
      await db.updateTransaction(res.transaction.id, { hash: mintResult.txHash });
    }
    await db.createAuditLog({
      id: "log_" + nanoid(12),
      user_id: userId,
      action: "CONTRACT_RESERVE_ONCHAIN",
      resource_type: "reserve",
      resource_id: token,
      details: { amount: qty, denom, txHash: mintResult.txHash },
      timestamp: Date.now(),
    });

    return {
      ...res,
      onchainTxHash: mintResult.txHash,
      mintscanUrl: MINTSCAN_TX(mintResult.txHash),
      message: `Reserved ${qty} ${token} on-chain (tx: ${mintResult.txHash.slice(0, 12)}…)`,
    };
  } catch (e: any) {
    console.error("[handleContractReserve] on-chain mint failed:", e);
    return { ...res, onchainError: e?.message || String(e) };
  } finally {
    release(reserveKey);
  }
}

// Admin "Send": when sending FROM the reserve, broadcasts a real MsgSend out
// of the treasury's holdings whenever the token is a real on-chain denom —
// this is what an admin "airdrop" actually is. Arbitrary address-to-address
// sends (from a non-"reserve" source) stay simulated-only: the treasury can
// only ever sign as itself, so a real broadcast can never legitimately claim
// to move funds "from" a user's address without their own signature.
export async function handleContractSend(userId: string, body: any, role: string) {
  const { from, toAddress, token, amount } = body;
  const qty = Number(amount);
  if (!toAddress || !token || !qty || qty <= 0)
    return { success: false, message: "Recipient, token and a positive amount are required" };
  if (!Number.isFinite(qty) || qty > MAX_ADMIN_TOKEN_AMOUNT) {
    return { success: false, message: `Amount must be a finite number no greater than ${MAX_ADMIN_TOKEN_AMOUNT}` };
  }

  // "from" defaults to sending straight out of the contract reserve, which
  // mirrors the admin airdrop page's original behavior; pass a real address
  // to move funds between two arbitrary addresses instead (simulated only).
  const source = from || "reserve";
  const isReserveSend = source === "reserve";

  if (isReserveSend) {
    const { isValidOsmoAddress } = await import("@/lib/cosmos/address");
    if (!isValidOsmoAddress(toAddress)) {
      return { success: false, message: "Recipient must be a valid osmo1… address" };
    }
  }

  const res = await voucherContract.executeSend(userId, source, toAddress, token, qty, {
    isAdmin: role === "admin",
  });
  if (!res.success) return res;
  if (!isReserveSend) return res;

  const { claim, release } = await import("./locks");
  const sendKey = `contract-send:${token}:${toAddress}`;
  if (!claim(sendKey)) {
    return { ...res, onchainError: "A send to this recipient for this token is already in progress." };
  }

  try {
    const { chainConfigured } = await import("./cosmos/status.server");
    if (!chainConfigured()) return res;

    const { getProtocolSigner, hasSufficientGas, readOnlyClient } = await import("./cosmos/signer.server");
    const { buildFactoryDenom, voucherSubdenom } = await import("@/lib/cosmos/denom");
    const { denomExistsForCreator } = await import("./cosmos/osmosisLcd.server");
    const { sendFromTreasury } = await import("./cosmos/liquidity.server");
    const { toMicroUnits } = await import("@/lib/cosmos/realDenoms");

    const signer = await getProtocolSigner();

    if (toAddress === signer.address) {
      return { ...res, onchainError: "Recipient is the treasury's own address — nothing to send on-chain." };
    }

    const denom = buildFactoryDenom(signer.address, voucherSubdenom(token));

    const exists = await denomExistsForCreator(denom, signer.address);
    if (!exists) {
      return { ...res, onchainError: `${token} has no real Token Factory denom on-chain yet — sent in simulation only.` };
    }

    const gas = await hasSufficientGas();
    if (!gas.ok) {
      return { ...res, onchainError: `Treasury needs funding for gas (has ${gas.balanceOSMO} OSMO) — sent in simulation only.` };
    }

    const microAmount = toMicroUnits(qty, 6);

    // Confirm the REAL on-chain treasury balance covers this send — the
    // simulated reserve counter above can drift from on-chain reality (a
    // server restart, a manual transfer, or concurrent requests).
    const client = await readOnlyClient();
    let realBalance: string;
    try {
      const coin = await client.getBalance(signer.address, denom);
      realBalance = coin.amount;
    } finally {
      client.disconnect();
    }
    if (BigInt(realBalance) < BigInt(microAmount)) {
      return {
        ...res,
        onchainError: `Treasury's real on-chain ${token} balance is insufficient for this send — sent in simulation only.`,
      };
    }

    const sendResult = await sendFromTreasury(toAddress, [{ denom, amount: microAmount }]);

    if (res.transaction) {
      res.transaction.hash = sendResult.txHash;
      await db.updateTransaction(res.transaction.id, { hash: sendResult.txHash });
    }
    await db.createAuditLog({
      id: "log_" + nanoid(12),
      user_id: userId,
      action: "CONTRACT_SEND_ONCHAIN",
      resource_type: "reserve",
      resource_id: token,
      details: { toAddress, amount: qty, denom, txHash: sendResult.txHash },
      timestamp: Date.now(),
    });

    return {
      ...res,
      onchainTxHash: sendResult.txHash,
      mintscanUrl: MINTSCAN_TX(sendResult.txHash),
      message: `Sent ${qty} ${token} on-chain to ${toAddress} (tx: ${sendResult.txHash.slice(0, 12)}…)`,
    };
  } catch (e: any) {
    console.error("[handleContractSend] on-chain send failed:", e);
    return { ...res, onchainError: e?.message || String(e) };
  } finally {
    release(sendKey);
  }
}

export async function handleContractReserveQuery(_userId: string, token: string) {
  return { success: true, ...voucherContract.queryReserve(token) };
}

export async function handleAddLiquidity(userId: string, body: any) {
  const { pair, amountA, amountB } = body;
  const qtyA = Number(amountA);
  const qtyB = Number(amountB);
  if (!qtyA || qtyA <= 0 || !qtyB || qtyB <= 0 || !pair)
    return { success: false, message: "Invalid liquidity parameters" };
  return await sim.addLiquidity(userId, pair, qtyA, qtyB);
}

// Admin-only: add REAL liquidity to an existing on-chain pool from treasury
// holdings. Distinct from handleAddLiquidity, which only updates the
// in-memory demo numbers — this broadcasts a real MsgJoinPool.
export async function handleAddLiquidityOnchain(userId: string, body: any) {
  const { poolId, denom, amount } = body;
  if (!poolId || !denom || !amount) {
    return { success: false, message: "poolId, denom, and amount are required" };
  }

  const { chainConfigured } = await import("./cosmos/status.server");
  if (!chainConfigured()) return { success: false, message: "Treasury not configured." };

  try {
    const { addLiquidity } = await import("./cosmos/liquidity.server");
    const result = await addLiquidity(String(poolId), denom, String(amount));

    await db.createAuditLog({
      id: "log_" + nanoid(12),
      user_id: userId,
      action: "ADD_LIQUIDITY_ONCHAIN",
      resource_type: "pool",
      resource_id: String(poolId),
      details: { contributed: result.contributed, txHash: result.txHash },
      timestamp: Date.now(),
    });

    return { success: true, txHash: result.txHash, contributed: result.contributed, mintscanUrl: MINTSCAN_TX(result.txHash) };
  } catch (e: any) {
    return { success: false, message: e?.message || String(e) };
  }
}

export async function handleRemoveLiquidity(userId: string, body: any) {
  const { pair, amountA, amountB } = body;
  const qtyA = Number(amountA);
  const qtyB = Number(amountB);
  if (!qtyA || qtyA <= 0 || !qtyB || qtyB <= 0 || !pair)
    return { success: false, message: "Invalid liquidity parameters" };
  return await sim.removeLiquidity(userId, pair, qtyA, qtyB);
}

function isBenignAlreadyExists(e: any): boolean {
  return /already exists|denom already|duplicate/i.test(String(e?.message ?? e));
}

export async function handleCreatePool(userId: string, body: any) {
  const { pair } = body;
  if (!pair) return { success: false, message: "Pair required" };

  // Real-money guard: pool creation spends 1,000 OSMO, non-refundable, per
  // call. The sim dict below is only as durable as the current process (it
  // resets on every dev-server reload, which has already happened several
  // times tonight), so it alone can't be trusted to prevent a double-spend —
  // claim synchronously first so two concurrent requests for the same pair
  // can't both slip through.
  const { claim, release } = await import("./locks");
  const pairKey = `create-pool:${pair.trim().toLowerCase()}`;
  if (!claim(pairKey)) {
    return { success: false, message: "A pool creation for this pair is already in progress." };
  }

  try {
    const res = await sim.createPool(userId, pair);
    if (!res.success) return res;
    // sim.createPool normalizes casing/prefix/order (e.g. "osmo/pepe" ->
    // "vOSMO/vPEPE") — use ITS result for the on-chain denoms too, otherwise a
    // raw, un-prefixed input here would create the wrong denom (e.g. "osmo"
    // instead of "vosmo") while the simulated pool key says "vOSMO".
    const normalizedPair = res.pair ?? pair;

    try {
      const { chainConfigured } = await import("./cosmos/status.server");
      if (!chainConfigured()) return res;

      const { createBalancerPool } = await import("./cosmos/liquidity.server");
      const { getProtocolSigner } = await import("./cosmos/signer.server");
      const { buildFactoryDenom, voucherSubdenom } = await import("@/lib/cosmos/denom");
      const { createDenom, mintToAddress } = await import("./cosmos/tokenFactory.server");
      const { findPoolByDenoms } = await import("./cosmos/osmosisLcd.server");

      const signer = await getProtocolSigner();
      const parts = normalizedPair.split("/");
      if (parts.length !== 2) return res;

      const subA = voucherSubdenom(parts[0]);
      const subB = voucherSubdenom(parts[1]);
      const denomA = buildFactoryDenom(signer.address, subA);
      const denomB = buildFactoryDenom(signer.address, subB);

      // Check the REAL chain — not just the in-memory sim dict — before
      // spending the 1,000 OSMO fee. Osmosis happily creates duplicate pools
      // for the same pair; nothing on-chain stops you from wasting the fee
      // twice.
      const existing = await findPoolByDenoms(denomA, denomB);
      if (existing) {
        return {
          ...res,
          onchainError: `A pool for this pair already exists on-chain (pool #${existing.id}) — not spending the 1,000 OSMO fee again.`,
          existingPoolId: existing.id,
        };
      }

      // Ensure both denoms are created on-chain first. A failure here that
      // ISN'T "already exists" means something real is wrong (insufficient
      // funds, wrong signer, network) — abort rather than silently
      // continuing to spend gas on a doomed pool-creation call.
      for (const [sub, symbol] of [
        [subA, parts[0]],
        [subB, parts[1]],
      ] as const) {
        try {
          await createDenom(sub, { symbol, name: `${symbol} Voucher` });
        } catch (e: any) {
          if (!isBenignAlreadyExists(e)) {
            return { ...res, onchainError: `Could not create denom ${sub}: ${e?.message || e}` };
          }
        }
      }

      // Mint initial liquidity to the treasury so it has balance to create
      // the pool. Same reasoning: a real mint failure must abort, not
      // proceed to a doomed createBalancerPool call.
      const initAmount = "100000000"; // 100 units
      for (const denom of [denomA, denomB]) {
        try {
          await mintToAddress(denom, initAmount, signer.address);
        } catch (e: any) {
          return { ...res, onchainError: `Could not mint seed liquidity for ${denom}: ${e?.message || e}` };
        }
      }

      // Create the pool on-chain
      const poolAssets = [
        { denom: denomA, amount: initAmount },
        { denom: denomB, amount: initAmount },
      ];
      const onchainResult = await createBalancerPool(poolAssets, "0.003");
      console.log("[handleCreatePool] On-chain pool created successfully:", onchainResult);

      return {
        ...res,
        onchainTxHash: onchainResult.txHash,
        message: `Pool created on-chain (tx: ${onchainResult.txHash.slice(0, 12)}…)`,
      };
    } catch (error: any) {
      console.error("[handleCreatePool] On-chain pool creation failed:", error);
      return {
        ...res,
        onchainError: error?.message || String(error),
      };
    }
  } finally {
    release(pairKey);
  }
}

export async function handleDeletePool(userId: string, body: any) {
  const { pair } = body;
  if (!pair) return { success: false, message: "Pair required" };
  return await sim.deletePool(userId, pair);
}

// Admin-only: swap arbitrary treasury-held denoms on Osmosis (e.g. rebalance
// OSMO into USDC to cover a fee that must be paid in a specific denom).
// Distinct from swapVouchersOnChain, which is scoped to vXXX factory denoms
// on behalf of a user — this operates directly on the treasury's own
// holdings for protocol/admin purposes.
export async function handleTreasurySwap(userId: string, body: any) {
  const { fromDenom, toDenom, amountIn, slippagePct } = body;
  if (!fromDenom || !toDenom || !amountIn) {
    return { success: false, message: "fromDenom, toDenom, and amountIn are required" };
  }

  const { chainConfigured } = await import("./cosmos/status.server");
  if (!chainConfigured()) {
    return { success: false, message: "Treasury not configured." };
  }

  try {
    const { swapOnOsmosis } = await import("./cosmos/osmosisSwap.server");
    const result = await swapOnOsmosis(fromDenom, toDenom, String(amountIn), Number(slippagePct) || 1);

    await db.createAuditLog({
      id: "log_" + nanoid(12),
      user_id: userId,
      action: "TREASURY_SWAP",
      resource_type: "treasury",
      resource_id: `${fromDenom}/${toDenom}`,
      details: { fromDenom, toDenom, amountIn, amountOut: result.amountOut, poolId: result.poolId, txHash: result.txHash },
      timestamp: Date.now(),
    });

    return {
      success: true,
      txHash: result.txHash,
      poolId: result.poolId,
      amountOut: result.amountOut,
      mintscanUrl: result.mintscanUrl,
    };
  } catch (e: any) {
    return { success: false, message: e?.message || String(e) };
  }
}
