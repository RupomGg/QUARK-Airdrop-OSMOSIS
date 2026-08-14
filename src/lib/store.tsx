import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  type ReactNode,
} from "react";

export type TokenSymbol = string;

export interface TokenBalance {
  symbol: TokenSymbol;
  name: string;
  supply: number;
  price: number;
  change24h: number;
  userBalance: number;
}

export type VoucherStatus = "active" | "redeemed" | "transferred" | "burned";

export interface Voucher {
  id: string;
  code: string;
  token: TokenSymbol;
  amount: number;
  owner: string;
  status: VoucherStatus;
  createdAt: number;
  note?: string;
  onchainMintTx?: string;
}

export type TxType = "mint" | "burn" | "swap" | "redeem" | "transfer" | "voucher" | "send" | "lend" | "borrow" | "repay";

export interface Transaction {
  id: string;
  type: TxType;
  token: TokenSymbol;
  amount: number;
  from?: string;
  to?: string;
  hash: string;
  timestamp: number;
  status: "success" | "pending" | "failed";
}

export type WalletProvider = "keplr" | "leap" | "walletconnect" | "metamask" | null;
export type UserRole = "user" | "admin";

interface User {
  name: string;
  address: string;
  email: string;
  authenticated: boolean;
  connected: boolean;
  provider: WalletProvider;
  role: UserRole;
}

export interface ContractStatus {
  pools: Record<string, { reserveA: number; reserveB: number }>;
  supply: Record<TokenSymbol, number>;
  collateral: Record<TokenSymbol, number>;
}

export interface LendingPosition {
  id: string;
  token: TokenSymbol;
  type: "supply" | "borrow";
  amount: number;
  apy: number;
  createdAt: number;
}

interface StoreState {
  user: User;
  tokens: Record<TokenSymbol, TokenBalance>;
  vouchers: Voucher[];
  transactions: Transaction[];
  positions: LendingPosition[];
  contractStatus: ContractStatus;
  escrow: { baseAmount: number; vAmount: number; yieldGenerated: boolean; token: TokenSymbol | null };
  // actions
  connectWallet: (provider: WalletProvider, address: string) => void;
  disconnectWallet: () => void;
  login: (email: string, role?: UserRole) => void;
  logout: () => void;
  setRole: (role: UserRole) => void;
  updateProfile: (p: Partial<User>) => void;
  refreshAppState: () => Promise<void>;
  mint: (token: TokenSymbol, amount: number) => void;
  burn: (token: TokenSymbol, amount: number) => void;
  createVoucher: (token: TokenSymbol, amount: number, note?: string) => Voucher;
  applyVoucherFromServer: (v: Voucher) => void;
  redeemVoucher: (id: string) => boolean;
  transferVoucher: (id: string, to: string) => boolean;
  swap: (from: TokenSymbol, to: TokenSymbol, amount: number) => void;
  swapTokenToVoucher: (token: TokenSymbol, amount: number) => Voucher | null;
  swapVoucherToToken: (id: string) => boolean;
  sendTokens: (token: TokenSymbol, amount: number, to: string) => boolean;
  supply: (token: TokenSymbol, amount: number) => void;
  borrow: (token: TokenSymbol, amount: number) => void;
  repay: (id: string) => boolean;
  withdraw: (id: string) => boolean;
}

const StoreCtx = createContext<StoreState | null>(null);

const initialTokens: Record<TokenSymbol, TokenBalance> = {};

const seedVouchers = (): Voucher[] => [];

const seedTxs = (): Transaction[] => [];

// Note: all token/voucher/lending mutations are performed by the backend
// against real chain/db state. The store no longer fabricates tx hashes,
// voucher codes, balances, or APYs on the client. After any action,
// components must call refreshAppState() to re-pull authoritative state.

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>({
    name: "Guest",
    address: "",
    email: "",
    authenticated: false,
    connected: false,
    provider: null,
    role: "user",
  });
  const [tokens, setTokens] = useState(initialTokens);
  const [vouchers, setVouchers] = useState<Voucher[]>(seedVouchers());
  const [transactions, setTransactions] = useState<Transaction[]>(seedTxs());
  const [positions, setPositions] = useState<LendingPosition[]>([]);
  const [escrow, setEscrow] = useState<{ baseAmount: number; vAmount: number; yieldGenerated: boolean; token: TokenSymbol | null }>({
    baseAmount: 0,
    vAmount: 0,
    yieldGenerated: false,
    token: null,
  });
  const [contractStatus, setContractStatus] = useState<ContractStatus>({
    pools: {},
    supply: {},
    collateral: {},
  });

  const hydrateTokens = useCallback((balances?: Record<string, number>, supply?: Record<string, number>) => {
    setTokens((current) => {
      const next: Record<string, TokenBalance> = { ...current };
      if (supply) {
        Object.entries(supply).forEach(([key, value]) => {
          next[key] = next[key]
            ? { ...next[key], supply: value }
            : { symbol: key, name: key, supply: value, price: 1.0, change24h: 0.0, userBalance: 0 };
        });
      }
      if (balances) {
        Object.entries(balances).forEach(([key, value]) => {
          // Avoid mapping vouchers (v*) into base token balances if they aren't meant to be here,
          // but if we support dynamic balances, it's safer to just instantiate them.
          next[key] = next[key]
            ? { ...next[key], userBalance: value }
            : { symbol: key, name: key, supply: 0, price: 1.0, change24h: 0.0, userBalance: value };
        });
      }
      return next;
    });
  }, []);

  const refreshAppState = useCallback(async () => {
    try {
      const { authAPI, walletAPI, voucherAPI, transactionAPI, lendingAPI, contractAPI, getSessionToken } = await import("@/lib/api");
      // Skip silently when no session token — guest visitors should not trigger 401 noise.
      if (!getSessionToken()) return;
      const verify = await authAPI.verify().catch(() => null);
      if (!verify || !verify.valid) return;

      const savedWalletConnected = typeof window !== "undefined" && window.localStorage.getItem("walletConnected") === "true";
      setUser((u) => ({ ...u, authenticated: true, role: verify.role as UserRole, email: verify.user?.email || u.email, name: verify.user?.name || u.name }));

      const [wsRes, vRes, tRes, pRes, cRes] = await Promise.allSettled([
        walletAPI.getSession(),
        voucherAPI.getAll(),
        transactionAPI.getAll(),
        lendingAPI.getPositions(),
        contractAPI.getStatus(),
      ]);

      if (wsRes.status === "fulfilled" && wsRes.value && wsRes.value.success && wsRes.value.session) {
        // Balances are authoritative server state — hydrate them regardless of
        // the "Connect Wallet" UI flag. That flag only controls whether we show
        // the user as having an external (Keplr) wallet linked; it must never
        // gate whether we display up-to-date balances, or mint/swap/redeem
        // actions appear to do nothing even though the backend applied them.
        const s = wsRes.value.session as any;
        // The saved wallet session IS the authoritative record that a wallet
        // is linked — trust it over the localStorage flag, which is easily
        // lost (cleared storage, different browser profile, incognito) and
        // was silently forcing real on-chain redeem/mint flows down the
        // simulated path because user.address came back empty.
        if (s.address) {
          setUser((u) => ({ ...u, connected: true, provider: s.provider, address: s.address }));
        } else if (savedWalletConnected) {
          setUser((u) => ({ ...u, connected: true, provider: s.provider, address: s.address }));
        }
        hydrateTokens(s.balances, cRes.status === "fulfilled" && cRes.value?.status?.supply ? cRes.value.status.supply : undefined);
      }

      if (vRes.status === "fulfilled" && vRes.value && vRes.value.success) {
        const list = vRes.value.vouchers || [];
        setVouchers(list.map((v: any) => ({ id: v.id, code: v.code, token: v.token, amount: v.amount, owner: v.owner_id ?? "you", status: v.status, createdAt: v.created_at, note: v.note, onchainMintTx: v.onchain_mint_tx })));
      }

      if (tRes.status === "fulfilled" && tRes.value && tRes.value.success) {
        const list = tRes.value.transactions || [];
        setTransactions(list.map((tx: any) => ({ id: tx.id, type: tx.type, token: tx.token, amount: tx.amount, from: tx.from_address, to: tx.to_address, hash: tx.hash, timestamp: tx.timestamp, status: tx.status })));
      }

      if (pRes.status === "fulfilled" && pRes.value && pRes.value.success) {
        const list = pRes.value.positions || [];
        setPositions(list.map((p: any) => ({ id: p.id, token: p.token, type: p.type, amount: p.amount, apy: p.apy, createdAt: p.created_at })));
      }

      if (cRes.status === "fulfilled" && cRes.value && cRes.value.success) {
        setContractStatus(cRes.value.status);
        hydrateTokens(undefined, cRes.value.status.supply);
      }
    } catch (e) {
      console.error("Failed to refresh app state:", e);
    }
  }, [hydrateTokens]);

  // Restore session & wallet on mount
  useEffect(() => {
    void refreshAppState();
  }, [refreshAppState]);

  // Thin wrappers: real work happens via API in the calling component, then
  // we refresh authoritative state from the backend. No optimistic mutations.
  const refresh = () => { void refreshAppState(); };

  const value = useMemo<StoreState>(() => ({
    user,
    tokens,
    vouchers,
    transactions,
    positions,
    contractStatus,
    escrow,
    refreshAppState,
    connectWallet: (provider, address) => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("walletConnected", "true");
      }
      setUser((u) => ({
        ...u,
        connected: true,
        authenticated: true,
        provider,
        address,
        role: u.role === "admin" ? "admin" : "user",
        name: u.name && u.name !== "Guest" ? u.name : "Wallet User",
        email: u.email || `${provider}-${address.slice(-6)}@wallet.quark`,
      }));
      setTimeout(() => { void refreshAppState(); }, 50);
    },
    disconnectWallet: () => {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("walletConnected");
      }
      setUser((u) => ({ ...u, connected: false, provider: null, address: "" }));
    },
    login: (email, role = "user") => setUser((u) => ({ ...u, email, role, authenticated: true, connected: false, name: role === "admin" ? "Admin" : "User" })),
    logout: () => {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("walletConnected");
      }
      setUser((u) => ({ ...u, authenticated: false, connected: false, provider: null, address: "" }));
    },
    setRole: (role) => setUser((u) => ({ ...u, role, name: role === "admin" ? "Admin" : "User" })),
    updateProfile: (p) => setUser((u) => ({ ...u, ...p })),
    // The following mutators are deprecated client-side stubs — every caller
    // should hit the backend API directly and then await refreshAppState().
    mint: () => refresh(),
    burn: () => refresh(),
    createVoucher: () => { refresh(); throw new Error("Use voucherAPI.create() then refreshAppState()"); },
    applyVoucherFromServer: () => refresh(),
    redeemVoucher: () => { refresh(); return false; },
    transferVoucher: () => { refresh(); return false; },
    swap: () => refresh(),
    swapTokenToVoucher: () => { refresh(); return null; },
    swapVoucherToToken: () => { refresh(); return false; },
    sendTokens: () => { refresh(); return false; },
    supply: () => refresh(),
    borrow: () => refresh(),
    repay: () => { refresh(); return false; },
    withdraw: () => { refresh(); return false; },
  }), [user, tokens, vouchers, transactions, positions, contractStatus, escrow, refreshAppState]);

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

export const fmt = (n: number, d = 2) =>
  n >= 1
    ? n.toLocaleString(undefined, { maximumFractionDigits: d })
    : n.toLocaleString(undefined, { maximumFractionDigits: 8 });
