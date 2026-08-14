import * as routes from "./routes";
import { ensureDevSeed } from "./db";

export type APIResponse = {
  success: boolean;
  message?: string;
  data?: any;
  error?: string;
};

type RequestEvent = { request: Request };

export async function handleAPIRequest(event: RequestEvent) {
  // Seed a stable dev admin in the in-memory DB when running locally.
  if (process.env.NODE_ENV !== "production") {
    void ensureDevSeed();
  }
  const url = new URL(event.request.url);
  const pathname = url.pathname;
  const method = event.request.method;

  // Parse authorization
  const auth = event.request.headers.get("authorization");
  const sessionToken = auth?.replace("Bearer ", "");

  let body: any = {};
  if (method !== "GET") {
    try {
      body = await event.request.json();
    } catch {
      return sendResponse(400, { success: false, error: "Invalid JSON" });
    }
  }

  // Auth routes (no session required)
  if (pathname === "/api/auth/signup" && method === "POST") {
    const result = await routes.handleSignup(body);
    return sendResponse(200, result);
  }

  if (pathname === "/api/auth/login" && method === "POST") {
    console.log("[api] POST /api/auth/login body:", JSON.stringify(body));
    const result = await routes.handleLogin(body);
    return sendResponse(200, result);
  }

  if (pathname === "/api/auth/login-wallet" && method === "POST") {
    const result = await routes.handleLoginWithWallet(body);
    return sendResponse(200, result);
  }

  if (pathname === "/api/auth/forgot-password" && method === "POST") {
    const result = await routes.handleForgotPassword(body);
    return sendResponse(200, result);
  }

  if (pathname === "/api/auth/reset-password" && method === "POST") {
    const result = await routes.handleResetPassword(body);
    return sendResponse(200, result);
  }

  if (pathname === "/api/auth/logout" && method === "POST") {
    const result = await routes.handleLogout(body);
    return sendResponse(200, result);
  }

  if (pathname === "/api/auth/verify" && method === "GET") {
    if (!sessionToken) {
      return sendResponse(401, { success: false, error: "Unauthorized" });
    }
    const result = await routes.handleVerifySession(sessionToken);
    return sendResponse(200, { success: result.valid, ...result });
  }

  // Public helper routes
  if (pathname === "/api/debug/setup" && method === "POST") {
    console.log("[api] POST /api/debug/setup body:", JSON.stringify(body));
    const result = await routes.handleDebugBootstrap(body);
    return sendResponse(200, result);
  }

  if (pathname === "/api/explorer/check" && method === "POST") {
    const result = await routes.handleCheckExplorer(body);
    return sendResponse(200, result);
  }

  // All other routes require authentication
  if (!sessionToken) {
    return sendResponse(401, { success: false, error: "Unauthorized" });
  }

  const session = await routes.handleVerifySession(sessionToken);
  if (!session.valid || !session.userId) {
    return sendResponse(401, { success: false, error: "Invalid session" });
  }

  const userId = session.userId;

  // Voucher routes
  if (pathname === "/api/vouchers" && method === "POST") {
    const result = await routes.handleCreateVoucher(userId, body);
    return sendResponse(200, result);
  }

  if (pathname === "/api/vouchers" && method === "GET") {
    const result = await routes.handleGetVouchers(userId);
    return sendResponse(200, result);
  }

  if (pathname === "/api/vouchers/redeem" && method === "POST") {
    const result = await routes.handleRedeemVoucher(userId, body);
    return sendResponse(200, result);
  }

  if (pathname === "/api/vouchers/transfer" && method === "POST") {
    const result = await routes.handleTransferVoucher(userId, body);
    return sendResponse(200, result);
  }

  if (pathname === "/api/vouchers/mint-onchain" && method === "POST") {
    const result = await routes.handleCreateVoucherOnchain(userId, body);
    return sendResponse(200, result);
  }

  if (pathname === "/api/vouchers/redeem-onchain" && method === "POST") {
    const result = await routes.handleRedeemVoucherOnchain(userId, body);
    return sendResponse(200, result);
  }

  if (pathname === "/api/vouchers/redeem-wallet-onchain" && method === "POST") {
    const result = await routes.handleRedeemWalletOnchain(userId, body);
    return sendResponse(200, result);
  }

  // Transaction routes
  if (pathname === "/api/transactions" && method === "GET") {
    const result = await routes.handleGetTransactions(userId);
    return sendResponse(200, result);
  }

  if (pathname === "/api/transactions" && method === "POST") {
    const result = await routes.handleCreateTransaction(userId, body, session.role || "user");
    return sendResponse(200, result);
  }

  // Wallet session routes
  if (pathname === "/api/wallet/session" && method === "GET") {
    const result = await routes.handleGetWalletSession(userId);
    return sendResponse(200, result);
  }

  if (pathname === "/api/wallet/session" && method === "POST") {
    const result = await routes.handleSaveWalletSession(userId, body);
    return sendResponse(200, result);
  }

  // Lending routes
  if (pathname === "/api/lending" && method === "GET") {
    const result = await routes.handleGetLendingPositions(userId);
    return sendResponse(200, result);
  }

  if (pathname === "/api/lending" && method === "POST") {
    const result = await routes.handleCreateLendingPosition(userId, body);
    return sendResponse(200, result);
  }

  if (pathname === "/api/lending/close" && method === "POST") {
    const result = await routes.handleCloseLendingPosition(userId, body);
    return sendResponse(200, result);
  }

  // Audit log routes (admin only)
  if (pathname === "/api/audit" && method === "GET") {
    if (session.role !== "admin") {
      return sendResponse(403, { success: false, error: "Forbidden" });
    }
    const result = await routes.handleGetAuditLogs(userId, true);
    return sendResponse(200, result);
  }

  // Admin Protocol routes
  if (pathname === "/api/admin/reserve/mint" && method === "POST") {
    if (session.role !== "admin") return sendResponse(403, { success: false, error: "Forbidden" });
    const result = await routes.handleMintReserve(userId, body);
    return sendResponse(200, result);
  }

  if (pathname === "/api/admin/reserve/burn" && method === "POST") {
    if (session.role !== "admin") return sendResponse(403, { success: false, error: "Forbidden" });
    const result = await routes.handleBurnReserve(userId, body);
    return sendResponse(200, result);
  }

  if (pathname === "/api/admin/generator" && method === "POST") {
    if (session.role !== "admin") return sendResponse(403, { success: false, error: "Forbidden" });
    const result = await routes.handleGenerateVoucher(userId, body);
    return sendResponse(200, result);
  }

  if (pathname === "/api/admin/airdrop" && method === "POST") {
    if (session.role !== "admin") return sendResponse(403, { success: false, error: "Forbidden" });
    const result = await routes.handleAirdrop(userId, body);
    return sendResponse(200, result);
  }

  // Simulated smart contract: reserve (mint-to-self) and send (reserve or
  // address -> address), for base tokens and vouchers alike.
  if (pathname === "/api/admin/contract/reserve" && method === "POST") {
    if (session.role !== "admin") return sendResponse(403, { success: false, error: "Forbidden" });
    const result = await routes.handleContractReserve(userId, body);
    return sendResponse(200, result);
  }

  if (pathname === "/api/admin/contract/send" && method === "POST") {
    if (session.role !== "admin") return sendResponse(403, { success: false, error: "Forbidden" });
    const result = await routes.handleContractSend(userId, body, session.role);
    return sendResponse(200, result);
  }

  if (pathname === "/api/admin/liquidity/add" && method === "POST") {
    if (session.role !== "admin") return sendResponse(403, { success: false, error: "Forbidden" });
    const result = await routes.handleAddLiquidity(userId, body);
    return sendResponse(200, result);
  }

  if (pathname === "/api/admin/liquidity/add-onchain" && method === "POST") {
    if (session.role !== "admin") return sendResponse(403, { success: false, error: "Forbidden" });
    const result = await routes.handleAddLiquidityOnchain(userId, body);
    return sendResponse(200, result);
  }

  if (pathname === "/api/admin/liquidity/remove" && method === "POST") {
    if (session.role !== "admin") return sendResponse(403, { success: false, error: "Forbidden" });
    const result = await routes.handleRemoveLiquidity(userId, body);
    return sendResponse(200, result);
  }

  if (pathname === "/api/admin/liquidity/create-pool" && method === "POST") {
    if (session.role !== "admin") return sendResponse(403, { success: false, error: "Forbidden" });
    const result = await routes.handleCreatePool(userId, body);
    return sendResponse(200, result);
  }

  if (pathname === "/api/admin/liquidity/delete-pool" && method === "POST") {
    if (session.role !== "admin") return sendResponse(403, { success: false, error: "Forbidden" });
    const result = await routes.handleDeletePool(userId, body);
    return sendResponse(200, result);
  }

  if (pathname === "/api/admin/treasury/swap" && method === "POST") {
    if (session.role !== "admin") return sendResponse(403, { success: false, error: "Forbidden" });
    const result = await routes.handleTreasurySwap(userId, body);
    return sendResponse(200, result);
  }

  // Swap routes
  if (pathname === "/api/swap" && method === "POST") {
    const result = await routes.handleSwap(userId, body);
    return sendResponse(200, result);
  }

  if (pathname === "/api/swap/voucher" && method === "POST") {
    const result = await routes.handleSwapVoucher(userId, body);
    return sendResponse(200, result);
  }

  if (pathname === "/api/swap/voucher-onchain" && method === "POST") {
    const result = await routes.handleSwapVoucherOnchain(userId, body);
    return sendResponse(200, result);
  }

  if (pathname === "/api/contract/status" && method === "GET") {
    const result = await routes.handleGetContractStatus(userId);
    return sendResponse(200, result);
  }

  // Osmosis DEX pool visibility query (public LCD — no admin required)
  if (pathname === "/api/osmosis/pools" && method === "GET") {
    const result = await routes.handleGetOsmosisPools();
    return sendResponse(200, result);
  }

  // Explorer reachability probe (server-side)
  if (pathname === "/api/explorer/check" && method === "POST") {
    const result = await routes.handleCheckExplorer(body);
    return sendResponse(200, result);
  }

  if (pathname === "/api/debug/setup" && method === "POST") {
    const result = await routes.handleDebugBootstrap(body);
    return sendResponse(200, result);
  }

  return sendResponse(404, { success: false, error: "Not found" });
}

function sendResponse(status: number, data: any): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
