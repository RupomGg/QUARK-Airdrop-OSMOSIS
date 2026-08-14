import { toast } from "sonner";

// Get session token from localStorage
export const getSessionToken = () => localStorage.getItem("sessionToken");
export const setSessionToken = (token: string) => localStorage.setItem("sessionToken", token);
export const clearSessionToken = () => localStorage.removeItem("sessionToken");

interface FetchOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: any;
  requiresAuth?: boolean;
}

async function apiCall(endpoint: string, options: FetchOptions = {}) {
  const { method = "GET", body, requiresAuth = true } = options;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (requiresAuth) {
    const token = getSessionToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  const config: RequestInit = {
    method,
    headers,
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`/api${endpoint}`, config);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || `HTTP ${response.status}`);
    }

    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : "An error occurred";
    if (!endpoint.startsWith("/auth/verify")) {
      console.error(`API error on ${endpoint}:`, message);
    }
    throw error;
  }
}

// Auth API
export const authAPI = {
  signup: (email: string, password: string, name?: string) =>
    apiCall("/auth/signup", {
      method: "POST",
      body: { email, password, name },
      requiresAuth: false,
    }),

  login: (email: string, password: string) =>
    apiCall("/auth/login", {
      method: "POST",
      body: { email, password },
      requiresAuth: false,
    }),

  loginWithWallet: (email: string, provider: "keplr" | "leap" | "metamask", address: string) =>
    apiCall("/auth/login-wallet", {
      method: "POST",
      body: { email, provider, address },
      requiresAuth: false,
    }),

  forgotPassword: (email: string) =>
    apiCall("/auth/forgot-password", {
      method: "POST",
      body: { email },
      requiresAuth: false,
    }),

  resetPassword: (token: string, password: string) =>
    apiCall("/auth/reset-password", {
      method: "POST",
      body: { token, password },
      requiresAuth: false,
    }),

  logout: () =>
    apiCall("/auth/logout", {
      method: "POST",
      body: { sessionToken: getSessionToken() },
    }),

  verify: () => apiCall("/auth/verify", { method: "GET" }),
};

// Voucher API
export const voucherAPI = {
  create: (
    token: string,
    amount: number,
    note?: string,
    swapSource?: { token: string; amount: number },
  ) =>
    apiCall("/vouchers", {
      method: "POST",
      body: { token, amount, note, swapSource },
    }),

  getAll: () => apiCall("/vouchers", { method: "GET" }),

  redeem: (voucherId: string) =>
    apiCall("/vouchers/redeem", {
      method: "POST",
      body: { voucherId },
    }),

  transfer: (voucherId: string, toAddress: string) =>
    apiCall("/vouchers/transfer", {
      method: "POST",
      body: { voucherId, toAddress },
    }),

  // Real on-chain mint: call AFTER the user has signed+broadcast the real
  // escrow transfer via Keplr (see sendViaKeplr) — escrowTxHash proves it.
  mintOnchain: (token: string, amount: number, escrowTxHash: string) =>
    apiCall("/vouchers/mint-onchain", {
      method: "POST",
      body: { token, amount, escrowTxHash },
    }),

  // Real on-chain redemption counterpart: call AFTER the user has sent the
  // real voucher tokens back to the treasury via Keplr.
  redeemOnchain: (voucherId: string, returnTxHash: string) =>
    apiCall("/vouchers/redeem-onchain", {
      method: "POST",
      body: { voucherId, returnTxHash },
    }),

  // Same real on-chain redemption, but for voucher tokens held in the
  // wallet without a DBVoucher record (e.g. received via a direct admin
  // airdrop rather than the app's own escrow-mint flow). No voucherId —
  // ownership is established purely from the verified on-chain transfer.
  redeemWalletOnchain: (token: string, amount: number, returnTxHash: string) =>
    apiCall("/vouchers/redeem-wallet-onchain", {
      method: "POST",
      body: { token, amount, returnTxHash },
    }),
};

// Transaction API
export const transactionAPI = {
  getAll: () => apiCall("/transactions", { method: "GET" }),

  create: (
    type: string,
    token: string,
    amount: number,
    options?: { fromToken?: string; toToken?: string; toAddress?: string },
  ) =>
    apiCall("/transactions", {
      method: "POST",
      body: { type, token, amount, ...options },
    }),
};

// Wallet session API
export const walletAPI = {
  getSession: () => apiCall("/wallet/session", { method: "GET" }),

  saveSession: (
    provider: "keplr" | "leap" | "metamask",
    address: string,
    balances: Record<string, number>,
  ) =>
    apiCall("/wallet/session", {
      method: "POST",
      body: { provider, address, balances },
    }),
};

// Lending API
export const lendingAPI = {
  getPositions: () => apiCall("/lending", { method: "GET" }),

  create: (token: string, type: "supply" | "borrow", amount: number) =>
    apiCall("/lending", {
      method: "POST",
      body: { token, type, amount },
    }),

  close: (positionId: string) =>
    apiCall("/lending/close", {
      method: "POST",
      body: { positionId },
    }),
};

// Swap API
export const swapAPI = {
  swap: (from: string, to: string, amount: number) =>
    apiCall("/swap", {
      method: "POST",
      body: { from, to, amount },
    }),
  // Atomic voucher→voucher swap: swap + redeem + reissue in one server call
  swapVoucher: (voucherId: string, toToken: string, slippagePct = 1) =>
    apiCall("/swap/voucher", {
      method: "POST",
      body: { voucherId, toToken, slippagePct },
    }),

  // Real on-chain voucher swap: call AFTER the user has signed+broadcast the
  // real escrow transfer of their source voucher tokens via Keplr.
  swapVoucherOnchain: (voucherId: string, toToken: string, escrowTxHash: string, slippagePct = 1) =>
    apiCall("/swap/voucher-onchain", {
      method: "POST",
      body: { voucherId, toToken, escrowTxHash, slippagePct },
    }),
};

// Contract API
export const contractAPI = {
  getStatus: () => apiCall("/contract/status", { method: "GET" }),
};

// Audit API
export const auditAPI = {
  getLogs: () => apiCall("/audit", { method: "GET" }),
};

// Admin API
export const adminAPI = {
  mintReserve: (vToken: string, amount: number) =>
    apiCall("/admin/reserve/mint", {
      method: "POST",
      body: { vToken, amount },
    }),

  burnReserve: (vToken: string, amount: number) =>
    apiCall("/admin/reserve/burn", {
      method: "POST",
      body: { vToken, amount },
    }),

  generateVoucher: (token: string, symbol: string, decimals: number, supply: number) =>
    apiCall("/admin/generator", {
      method: "POST",
      body: { token, symbol, decimals, supply },
    }),

  airdrop: (toAddress: string, vToken: string, amount: number) =>
    apiCall("/admin/airdrop", {
      method: "POST",
      body: { toAddress, vToken, amount },
    }),

  // Simulated smart contract: mint into the contract's own reserve.
  contractReserve: (token: string, amount: number) =>
    apiCall("/admin/contract/reserve", {
      method: "POST",
      body: { token, amount },
    }),

  // Simulated smart contract: send from the reserve (from omitted / "reserve")
  // or from any address, to any address.
  contractSend: (toAddress: string, token: string, amount: number, from?: string) =>
    apiCall("/admin/contract/send", {
      method: "POST",
      body: { from, toAddress, token, amount },
    }),

  addLiquidity: (pair: string, amountA: number, amountB: number) =>
    apiCall("/admin/liquidity/add", {
      method: "POST",
      body: { pair, amountA, amountB },
    }),

  removeLiquidity: (pair: string, amountA: number, amountB: number) =>
    apiCall("/admin/liquidity/remove", {
      method: "POST",
      body: { pair, amountA, amountB },
    }),

  createPool: (pair: string) =>
    apiCall("/admin/liquidity/create-pool", {
      method: "POST",
      body: { pair },
    }),

  deletePool: (pair: string) =>
    apiCall("/admin/liquidity/delete-pool", {
      method: "POST",
      body: { pair },
    }),
};

// Osmosis DEX API — queries real on-chain pool data via server-side LCD calls
export const osmosisAPI = {
  getPools: () => apiCall("/osmosis/pools", { method: "GET" }),
};

/**
 * Returns true if the hash looks like a real Cosmos tx hash (64 uppercase hex).
 * Simulation hashes start with "SIM" or the old "0x" format.
 */
export function isRealCosmosTxHash(hash: string): boolean {
  if (!hash) return false;
  if (hash.startsWith("SIM") || hash.startsWith("0x")) return false;
  return /^[0-9A-F]{64}$/.test(hash);
}

/** Returns a Mintscan URL for a given Osmosis tx hash. */
export function mintscanTxUrl(hash: string): string {
  return `https://www.mintscan.io/osmosis/tx/${hash}`;
}

/** Returns a Mintscan URL for a given Osmosis address. */
export function mintscanAddressUrl(address: string): string {
  return `https://www.mintscan.io/osmosis/address/${address}`;
}
