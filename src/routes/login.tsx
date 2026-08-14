import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useStore, type UserRole } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Logo } from "@/components/logo";
import { WalletConnectModal } from "@/components/wallet-connect";
import { Shield, User as UserIcon, Wallet } from "lucide-react";
import { authAPI, setSessionToken } from "@/lib/api";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { login, refreshAppState } = useStore();
  const navigate = useNavigate();
  const [tab, setTab] = useState<UserRole>("user");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [walletOpen, setWalletOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Email and password required");
      return;
    }

    setLoading(true);
    try {
      const result = await authAPI.login(email, password);
      if (result.success && result.sessionToken && result.user?.role === "admin") {
        setSessionToken(result.sessionToken);
        login(email, "admin");
        await refreshAppState();
        toast.success("Admin login successful");
        navigate({ to: "/admin" });

      } else {
        toast.error(result.success && result.user?.role !== "admin" ? "This account is not an administrator." : result.message || "Login failed");
      }
    } catch (error) {
      toast.error(String(error));
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="absolute inset-0 bg-grid opacity-30" />
      <div className="absolute left-1/2 top-1/3 -z-10 h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
      <div className="relative w-full max-w-md space-y-5 rounded-2xl border border-border bg-card p-8">
        <Link to="/" className="flex items-center gap-2">
          <Logo className="size-8" />
          <span className="font-bold tracking-wide">QUARK</span>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Sign in</h1>
          <p className="text-sm text-muted-foreground">Choose how you want to enter the protocol.</p>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-background p-1">
          <button
            onClick={() => setTab("user")}
            className={`flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition ${tab === "user" ? "bg-primary/20 text-foreground" : "text-muted-foreground"}`}
          >
            <UserIcon className="size-4" /> User
          </button>
          <button
            onClick={() => setTab("admin")}
            className={`flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition ${tab === "admin" ? "bg-amber-500/20 text-amber-400" : "text-muted-foreground"}`}
          >
            <Shield className="size-4" /> Admin
          </button>
        </div>

        {tab === "user" ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Connect your Cosmos wallet to access token balances, vouchers, and transfers.</p>
            <Button onClick={() => setWalletOpen(true)} disabled={loading} className="w-full bg-primary text-primary-foreground hover:opacity-90 glow-primary">
              <Wallet className="mr-2 size-4" /> Connect Wallet
            </Button>
          </div>
        ) : (
          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} />
            </div>
            <Button type="submit" disabled={loading} className="w-full bg-amber-500 text-black hover:opacity-90">
              <Shield className="mr-2 size-4" /> {loading ? "Signing in..." : "Admin Sign in"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">Staff access only. Use your admin credentials.</p>
          </form>
        )}

        <div className="space-y-2 border-t border-border pt-4">
          {tab === "user" ? (
            <Link
              to="/admin-login"
              className="flex items-center justify-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 py-2 text-xs font-semibold text-amber-400 hover:bg-amber-500/10"
            >
              <Shield className="size-3.5" /> Administrator sign in →
            </Link>
          ) : null}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <Link to="/forgot-password" className="hover:text-foreground">Forgot password?</Link>
            <Link to="/signup" className="hover:text-foreground">Create an account →</Link>
          </div>
        </div>

      </div>
      <WalletConnectModal
        open={walletOpen}
        onClose={() => setWalletOpen(false)}
        onSuccess={() => {
          setWalletOpen(false);
          navigate({ to: "/app" });
        }}
      />
    </div>
  );
}
