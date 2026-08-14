import { nanoid } from "nanoid";
import { db, type DBUser, type DBWalletSession } from "./db";

const DEFAULT_TOKEN_BALANCES = {};

// Password hashing used by the current backend auth tables.
export const hashPassword = (password: string): string => {
  return "hash_" + Buffer.from(password).toString("base64");
};

const verifyPassword = (password: string, hash: string): boolean => {
  return hash === "hash_" + Buffer.from(password).toString("base64");
};

// Sessions are persisted via db.createSession / db.getSession when available

export interface AuthResponse {
  success: boolean;
  message?: string;
  user?: DBUser;
  sessionToken?: string;
}

export interface SignupPayload {
  email: string;
  password: string;
  name: string;
  role?: "user" | "admin";
}

export interface LoginPayload {
  email: string;
  password: string;
}

export async function signup(payload: SignupPayload): Promise<AuthResponse> {
  try {
    const { email, password, name, role = "user" } = payload;

    const existing = await db.getUserByEmail(email);
    if (existing) {
      return { success: false, message: "User already exists" };
    }

    const userId = "u_" + nanoid(12);
    const user: DBUser = {
      id: userId,
      email,
      name,
      address: "",
      password_hash: hashPassword(password),
      role,
      provider: null,
      connected: false,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    const created = await db.createUser(user);

    const sessionToken = nanoid(32);
    await db.createSession({
      token: sessionToken,
      user_id: user.id,
      role: user.role,
      expires_at: Date.now() + 7 * 24 * 60 * 60 * 1000,
      created_at: Date.now(),
    });

    return {
      success: true,
      user: created,
      sessionToken,
    };
  } catch (error) {
    return { success: false, message: String(error) };
  }
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  try {
    const { email, password } = payload;

    const user = await db.getUserByEmail(email);
    if (!user) {
      return { success: false, message: "User not found" };
    }

    if (!user.password_hash || !verifyPassword(password, user.password_hash)) {
      return { success: false, message: "Invalid password" };
    }

    const sessionToken = nanoid(32);
    await db.createSession({
      token: sessionToken,
      user_id: user.id,
      role: user.role,
      expires_at: Date.now() + 7 * 24 * 60 * 60 * 1000,
      created_at: Date.now(),
    });

    await db.updateUser(user.id, { connected: true });

    return {
      success: true,
      user: await db.getUser(user.id) || user,
      sessionToken,
    };
  } catch (error) {
    return { success: false, message: String(error) };
  }
}

export async function loginWithWallet(
  email: string,
  provider: "keplr" | "leap" | "metamask",
  address: string,
): Promise<AuthResponse> {
  try {
    // Find or create user
    let user = await db.getUserByEmail(email);

    if (!user) {
      const userId = "u_" + nanoid(12);
      user = {
        id: userId,
        email,
        name: email.split("@")[0],
        address,
        role: "user",
        provider,
        connected: true,
        created_at: Date.now(),
        updated_at: Date.now(),
      };
      user = await db.createUser(user);
    } else {
      user = await db.updateUser(user.id, { provider, address, connected: true }) || user;
    }

    // Ensure wallet session exists so wallet-backed actions can execute
    let walletSession = await db.getWalletSession(user.id);
    if (!walletSession) {
      walletSession = await db.createWalletSession({
        id: "ws_" + nanoid(12),
        user_id: user.id,
        provider,
        address,
        balances: { ...DEFAULT_TOKEN_BALANCES },
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    } else {
      await db.updateWalletSession(walletSession.id, { provider, address, balances: walletSession.balances });
    }

    const sessionToken = nanoid(32);
    await db.createSession({
      token: sessionToken,
      user_id: user.id,
      role: user.role,
      expires_at: Date.now() + 7 * 24 * 60 * 60 * 1000,
      created_at: Date.now(),
    });

    return {
      success: true,
      user: await db.getUser(user.id) || user,
      sessionToken,
    };
  } catch (error) {
    return { success: false, message: String(error) };
  }
}

export async function forgotPassword(email: string): Promise<AuthResponse> {
  try {
    const user = await db.getUserByEmail(email);
    if (user) {
      // In production, send email with reset link
      const resetToken = nanoid(32);
      await db.createSession({
        token: `reset_${resetToken}`,
        user_id: user.id,
        role: user.role,
        expires_at: Date.now() + 60 * 60 * 1000,
        created_at: Date.now(),
      });
    }

    return {
      success: true,
      message: "If your account exists, reset instructions have been sent to the registered email address.",
    };
  } catch (error) {
    return { success: false, message: String(error) };
  }
}

export async function resetPassword(resetToken: string, newPassword: string): Promise<AuthResponse> {
  try {
    const session = await db.getSession(`reset_${resetToken}`);
    if (!session || session.expires_at < Date.now()) {
      return { success: false, message: "Invalid or expired reset token" };
    }

    const user = await db.updateUser(session.user_id, {
      password_hash: hashPassword(newPassword),
    });

    if (!user) {
      return { success: false, message: "User not found" };
    }

    // Clear reset token/session
    await db.deleteSession(`reset_${resetToken}`);

    return {
      success: true,
      message: "Password reset successfully",
      user,
    };
  } catch (error) {
    return { success: false, message: String(error) };
  }
}

export async function logout(sessionToken: string): Promise<AuthResponse> {
  await db.deleteSession(sessionToken);
  return { success: true, message: "Logged out" };
}

export async function verifySession(sessionToken: string): Promise<{ valid: boolean; userId?: string; role?: string }> {
  const session = await db.getSession(sessionToken);
  if (!session || session.expires_at < Date.now()) {
    return { valid: false };
  }
  return { valid: true, userId: session.user_id, role: session.role };
}
