import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Initialize persistent storage through the app's server-side backend client.
// If backend env vars are unavailable, the preview falls back to in-memory storage.
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

export const supabase: SupabaseClient | null = USE_SUPABASE
  ? (supabaseAdmin as unknown as SupabaseClient)
  : null;

// Database schema types
export type SupportedToken = string;

export interface DBUser {
  id: string;
  email: string;
  name: string;
  address: string;
  password_hash?: string;
  role: "user" | "admin";
  provider: "keplr" | "leap" | "metamask" | null;
  connected: boolean;
  created_at: number;
  updated_at: number;
}

export interface DBVoucher {
  id: string;
  code: string;
  token: SupportedToken;
  amount: number;
  owner_id: string;
  status: "active" | "redeemed" | "transferred" | "burned";
  transferred_to?: string;
  created_at: number;
  redeemed_at?: number;
  note?: string;
  // Set only when the voucher was backed by a real, verified on-chain escrow
  // (see txVerify.server.ts) rather than the internal simulated ledger. When
  // present, redemption must return the real underlying token, not credit
  // the simulated balance.
  onchain_escrow_tx?: string;
  onchain_mint_tx?: string;
}

export interface DBTransaction {
  id: string;
  user_id: string;
  type:
    | "mint"
    | "burn"
    | "swap"
    | "redeem"
    | "transfer"
    | "voucher"
    | "send"
    | "lend"
    | "borrow"
    | "repay"
    | "airdrop";
  token: SupportedToken;
  amount: number;
  from_token?: SupportedToken;
  to_token?: SupportedToken;
  from_address?: string;
  to_address?: string;
  hash: string;
  timestamp: number;
  status: "success" | "pending" | "failed";
}

export interface DBWalletSession {
  id: string;
  user_id: string;
  provider: "keplr" | "leap" | "metamask";
  address: string;
  balances: Record<string, number>;
  created_at: number;
  updated_at: number;
}

export interface DBAuditLog {
  id: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: Record<string, any>;
  timestamp: number;
}

export interface DBLendingPosition {
  id: string;
  user_id: string;
  token: SupportedToken;
  type: "supply" | "borrow";
  amount: number;
  apy: number;
  created_at: number;
  updated_at: number;
}

export interface DBSession {
  token: string;
  user_id: string;
  role: string;
  expires_at: number;
  created_at: number;
}

// Local in-memory fallback used only when backend env vars are unavailable.
export const localDB = {
  users: new Map<string, DBUser>(),
  vouchers: new Map<string, DBVoucher>(),
  transactions: new Map<string, DBTransaction>(),
  walletSessions: new Map<string, DBWalletSession>(),
  auditLogs: new Map<string, DBAuditLog>(),
  lendingPositions: new Map<string, DBLendingPosition>(),
  sessions: new Map<string, DBSession>(),
};

// Trivial, non-cryptographic encoding matching auth.ts's hashPassword — kept
// as a local copy (rather than importing from ./auth) to avoid a circular
// import, since auth.ts already imports db.ts.
const devSeedHash = (password: string): string => "hash_" + Buffer.from(password).toString("base64");

// Ensure predictable dev admins exist when running without Supabase (local
// in-memory DB) — this Map resets on every server reload, so relying on a
// role-escalation hole in the signup endpoint isn't an option (and was a
// real vulnerability, since fixed). These are dev-only, gated behind
// USE_SUPABASE, and never reachable once Supabase is configured.
export async function ensureDevSeed() {
  if (USE_SUPABASE) return;
  const now = Date.now();
  const admins = [
    { id: "u_dev_admin", email: "oyetofun@gmail.com", password_hash: "hash_VG9mdW5taUAxMjM0NQ==" },
    { id: "u_dev_admin_2", email: "admin@quark.local", password_hash: devSeedHash("AdminPass123!") },
  ];
  for (const seed of admins) {
    if (Array.from(localDB.users.values()).some((u) => u.email === seed.email)) continue;
    const admin: DBUser = {
      id: seed.id,
      email: seed.email,
      name: "Admin",
      address: "",
      password_hash: seed.password_hash,
      role: "admin",
      provider: null,
      connected: true,
      created_at: now,
      updated_at: now,
    };
    localDB.users.set(admin.id, admin);
    const sessionToken = seed.id === "u_dev_admin" ? "dev_admin_token" : `dev_admin_token_${seed.id}`;
    localDB.sessions.set(sessionToken, {
      token: sessionToken,
      user_id: admin.id,
      role: "admin",
      expires_at: now + 7 * 24 * 60 * 60 * 1000,
      created_at: now,
    });
    console.log("[db] seeded dev admin user:", seed.email);
  }
}

// (USE_SUPABASE is declared above near the client initialization)

// Helper functions for DB operations (Supabase-backed when enabled, otherwise local)
export const db = {
  // User operations
  getUser: async (id: string): Promise<DBUser | null> => {
    if (USE_SUPABASE) {
      const { data, error } = await supabase!
        .from("users")
        .select("*")
        .eq("id", id)
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error("Supabase getUser error:", error.message);
        return null;
      }
      return (data as any) || null;
    }
    return localDB.users.get(id) || null;
  },
  getUserByEmail: async (email: string): Promise<DBUser | null> => {
    if (USE_SUPABASE) {
      const { data, error } = await supabase!
        .from("users")
        .select("*")
        .ilike("email", email)
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error("Supabase getUserByEmail error:", error.message);
        return null;
      }
      return (data as any) || null;
    }
    for (const user of localDB.users.values()) {
      if (user.email === email) return user;
    }
    return null;
  },
  createUser: async (user: DBUser): Promise<DBUser> => {
    if (USE_SUPABASE) {
      const payload = { ...user } as any;
      const { data, error } = await supabase!.from("users").insert(payload).select().maybeSingle();
      if (error) {
        console.error("Supabase createUser error:", error.message);
        throw error;
      }
      return data as DBUser;
    }
    localDB.users.set(user.id, user);
    return user;
  },
  updateUser: async (id: string, updates: Partial<DBUser>): Promise<DBUser | null> => {
    if (USE_SUPABASE) {
      const { data, error } = await supabase!
        .from("users")
        .update({ ...updates, updated_at: Date.now() })
        .eq("id", id)
        .select()
        .maybeSingle();
      if (error) {
        console.error("Supabase updateUser error:", error.message);
        return null;
      }
      return data as DBUser;
    }
    const user = localDB.users.get(id);
    if (!user) return null;
    const updated = { ...user, ...updates, updated_at: Date.now() };
    localDB.users.set(id, updated);
    return updated;
  },

  // Voucher operations
  getVoucher: async (id: string): Promise<DBVoucher | null> => {
    if (USE_SUPABASE) {
      const { data, error } = await supabase!
        .from("vouchers")
        .select("*")
        .eq("id", id)
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error("Supabase getVoucher error:", error.message);
        return null;
      }
      return (data as any) || null;
    }
    return localDB.vouchers.get(id) || null;
  },
  getVoucherByCode: async (code: string): Promise<DBVoucher | null> => {
    if (USE_SUPABASE) {
      const { data, error } = await supabase!
        .from("vouchers")
        .select("*")
        .eq("code", code)
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error("Supabase getVoucherByCode error:", error.message);
        return null;
      }
      return (data as any) || null;
    }
    for (const voucher of localDB.vouchers.values()) {
      if (voucher.code === code) return voucher;
    }
    return null;
  },
  getUserVouchers: async (userId: string): Promise<DBVoucher[]> => {
    if (USE_SUPABASE) {
      const { data, error } = await supabase!
        .from("vouchers")
        .select("*")
        .eq("owner_id", userId)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Supabase getUserVouchers error:", error.message);
        return [];
      }
      return (data as any) || [];
    }
    return Array.from(localDB.vouchers.values()).filter((v) => v.owner_id === userId);
  },
  createVoucher: async (voucher: DBVoucher): Promise<DBVoucher> => {
    if (USE_SUPABASE) {
      const { data, error } = await supabase!
        .from("vouchers")
        .insert(voucher)
        .select()
        .maybeSingle();
      if (error) {
        console.error("Supabase createVoucher error:", error.message);
        throw error;
      }
      return data as DBVoucher;
    }
    localDB.vouchers.set(voucher.id, voucher);
    return voucher;
  },
  updateVoucher: async (id: string, updates: Partial<DBVoucher>): Promise<DBVoucher | null> => {
    if (USE_SUPABASE) {
      const { data, error } = await supabase!
        .from("vouchers")
        .update(updates)
        .eq("id", id)
        .select()
        .maybeSingle();
      if (error) {
        console.error("Supabase updateVoucher error:", error.message);
        return null;
      }
      return data as DBVoucher;
    }
    const voucher = localDB.vouchers.get(id);
    if (!voucher) return null;
    const updated = { ...voucher, ...updates };
    localDB.vouchers.set(id, updated);
    return updated;
  },

  // Transaction operations
  getUserTransactions: async (userId: string): Promise<DBTransaction[]> => {
    if (USE_SUPABASE) {
      const { data, error } = await supabase!
        .from("transactions")
        .select("*")
        .eq("user_id", userId)
        .order("timestamp", { ascending: false });
      if (error) {
        console.error("Supabase getUserTransactions error:", error.message);
        return [];
      }
      return (data as any) || [];
    }
    return Array.from(localDB.transactions.values()).filter((t) => t.user_id === userId);
  },
  createTransaction: async (tx: DBTransaction): Promise<DBTransaction> => {
    if (USE_SUPABASE) {
      const { data, error } = await supabase!
        .from("transactions")
        .insert(tx)
        .select()
        .maybeSingle();
      if (error) {
        console.error("Supabase createTransaction error:", error.message);
        throw error;
      }
      return data as DBTransaction;
    }
    localDB.transactions.set(tx.id, tx);
    return tx;
  },
  updateTransaction: async (txId: string, updates: Partial<DBTransaction>): Promise<void> => {
    if (USE_SUPABASE) {
      const { error } = await supabase!.from("transactions").update(updates).eq("id", txId);
      if (error) console.error("Supabase updateTransaction error:", error.message);
      return;
    }
    const existing = localDB.transactions.get(txId);
    if (existing) localDB.transactions.set(txId, { ...existing, ...updates });
  },

  // Wallet session operations
  getWalletSession: async (userId: string): Promise<DBWalletSession | null> => {
    if (USE_SUPABASE) {
      const { data, error } = await supabase!
        .from("wallet_sessions")
        .select("*")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error("Supabase getWalletSession error:", error.message);
        return null;
      }
      return (data as any) || null;
    }
    for (const session of localDB.walletSessions.values()) {
      if (session.user_id === userId) return session;
    }
    return null;
  },
  getWalletSessionByAddress: async (address: string): Promise<DBWalletSession | null> => {
    if (USE_SUPABASE) {
      const { data, error } = await supabase!
        .from("wallet_sessions")
        .select("*")
        .eq("address", address)
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error("Supabase getWalletSessionByAddress error:", error.message);
        return null;
      }
      return (data as any) || null;
    }
    for (const session of localDB.walletSessions.values()) {
      if (session.address === address) return session;
    }
    return null;
  },
  createWalletSession: async (session: DBWalletSession): Promise<DBWalletSession> => {
    if (USE_SUPABASE) {
      const { data, error } = await supabase!
        .from("wallet_sessions")
        .insert(session)
        .select()
        .maybeSingle();
      if (error) {
        console.error("Supabase createWalletSession error:", error.message);
        throw error;
      }
      return data as DBWalletSession;
    }
    localDB.walletSessions.set(session.id, session);
    return session;
  },
  updateWalletSession: async (
    id: string,
    updates: Partial<DBWalletSession>,
  ): Promise<DBWalletSession | null> => {
    if (USE_SUPABASE) {
      const { data, error } = await supabase!
        .from("wallet_sessions")
        .update({ ...updates, updated_at: Date.now() })
        .eq("id", id)
        .select()
        .maybeSingle();
      if (error) {
        console.error("Supabase updateWalletSession error:", error.message);
        return null;
      }
      return data as DBWalletSession;
    }
    const session = localDB.walletSessions.get(id);
    if (!session) return null;
    const updated = { ...session, ...updates, updated_at: Date.now() };
    localDB.walletSessions.set(id, updated);
    return updated;
  },

  // Audit log operations
  createAuditLog: async (log: DBAuditLog): Promise<DBAuditLog> => {
    if (USE_SUPABASE) {
      const { data, error } = await supabase!.from("audit_logs").insert(log).select().maybeSingle();
      if (error) {
        console.error("Supabase createAuditLog error:", error.message);
        throw error;
      }
      return data as DBAuditLog;
    }
    localDB.auditLogs.set(log.id, log);
    return log;
  },
  getAuditLogs: async (userId?: string): Promise<DBAuditLog[]> => {
    if (USE_SUPABASE) {
      const q = supabase!.from("audit_logs").select("*");
      const { data, error } = userId ? await q.eq("user_id", userId) : await q;
      if (error) {
        console.error("Supabase getAuditLogs error:", error.message);
        return [];
      }
      return (data as any) || [];
    }
    const logs = Array.from(localDB.auditLogs.values());
    return userId ? logs.filter((l) => l.user_id === userId) : logs;
  },

  // Lending position operations
  getLendingPosition: async (id: string): Promise<DBLendingPosition | null> => {
    if (USE_SUPABASE) {
      const { data, error } = await supabase!
        .from("lending_positions")
        .select("*")
        .eq("id", id)
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error("Supabase getLendingPosition error:", error.message);
        return null;
      }
      return (data as any) || null;
    }
    return localDB.lendingPositions.get(id) || null;
  },
  getUserLendingPositions: async (userId: string): Promise<DBLendingPosition[]> => {
    if (USE_SUPABASE) {
      const { data, error } = await supabase!
        .from("lending_positions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Supabase getUserLendingPositions error:", error.message);
        return [];
      }
      return (data as any) || [];
    }
    return Array.from(localDB.lendingPositions.values()).filter((p) => p.user_id === userId);
  },
  createLendingPosition: async (position: DBLendingPosition): Promise<DBLendingPosition> => {
    if (USE_SUPABASE) {
      const { data, error } = await supabase!
        .from("lending_positions")
        .insert(position)
        .select()
        .maybeSingle();
      if (error) {
        console.error("Supabase createLendingPosition error:", error.message);
        throw error;
      }
      return data as DBLendingPosition;
    }
    localDB.lendingPositions.set(position.id, position);
    return position;
  },
  updateLendingPosition: async (
    id: string,
    updates: Partial<DBLendingPosition>,
  ): Promise<DBLendingPosition | null> => {
    if (USE_SUPABASE) {
      const { data, error } = await supabase!
        .from("lending_positions")
        .update({ ...updates, updated_at: Date.now() })
        .eq("id", id)
        .select()
        .maybeSingle();
      if (error) {
        console.error("Supabase updateLendingPosition error:", error.message);
        return null;
      }
      return data as DBLendingPosition;
    }
    const position = localDB.lendingPositions.get(id);
    if (!position) return null;
    const updated = { ...position, ...updates, updated_at: Date.now() };
    localDB.lendingPositions.set(id, updated);
    return updated;
  },
  deleteLendingPosition: async (id: string): Promise<boolean> => {
    if (USE_SUPABASE) {
      const { error } = await supabase!.from("lending_positions").delete().eq("id", id);
      if (error) {
        console.error("Supabase deleteLendingPosition error:", error.message);
        return false;
      }
      return true;
    }
    return localDB.lendingPositions.delete(id);
  },
  // Session operations
  createSession: async (s: DBSession): Promise<DBSession> => {
    if (USE_SUPABASE) {
      const { data, error } = await supabase!.from("sessions").insert(s).select().maybeSingle();
      if (error) {
        console.error("Supabase createSession error:", error.message);
        throw error;
      }
      return data as DBSession;
    }
    localDB.sessions.set(s.token, s);
    return s;
  },
  getSession: async (token: string): Promise<DBSession | null> => {
    if (USE_SUPABASE) {
      const { data, error } = await supabase!
        .from("sessions")
        .select("*")
        .eq("token", token)
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error("Supabase getSession error:", error.message);
        return null;
      }
      return (data as any) || null;
    }
    return localDB.sessions.get(token) || null;
  },
  deleteSession: async (token: string): Promise<boolean> => {
    if (USE_SUPABASE) {
      const { error } = await supabase!.from("sessions").delete().eq("token", token);
      if (error) {
        console.error("Supabase deleteSession error:", error.message);
        return false;
      }
      return true;
    }
    return localDB.sessions.delete(token);
  },
};
