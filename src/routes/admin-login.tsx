import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Logo } from "@/components/logo";
import { authAPI, setSessionToken } from "@/lib/api";
import { Shield, Lock, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/admin-login")({
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const { login, refreshAppState } = useStore();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) return setError("Email and password are required");

    setLoading(true);
    try {
      const result = await authAPI.login(email, password);
      if (result.success && result.sessionToken && result.user?.role === "admin") {
        setSessionToken(result.sessionToken);
        login(email, "admin");
        await refreshAppState();
        toast.success("Administrator session authorized");
        navigate({ to: "/admin/treasury" });
      } else {
        toast.error(result.message || "Admin login failed");
        setError(result.success && result.user?.role !== "admin" ? "This account is not an administrator." : null);
      }
    } catch (error) {
      toast.error(String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-6">
      <div className="absolute inset-0 bg-grid opacity-30" />
      <div className="absolute left-1/2 top-1/3 -z-10 h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-amber-500/20 blur-3xl" />

      <div className="relative w-full max-w-md space-y-5 rounded-2xl border border-amber-500/30 bg-card p-8 shadow-2xl">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Logo className="size-8" />
            <span className="font-bold tracking-wide">QUARK</span>
          </Link>
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-400">
            <Shield className="size-3" /> Admin Console
          </span>
        </div>

        <div>
          <h1 className="text-2xl font-bold">Restricted access</h1>
          <p className="text-sm text-muted-foreground">
            Sign in with your administrator credentials.
          </p>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-400/90">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>All admin actions are logged. Unauthorized access is monitored and reported.</span>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Admin email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </div>
          <div className="space-y-2">
            <Label>Password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full bg-amber-500 text-black hover:opacity-90 disabled:opacity-60">
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="size-3 animate-spin rounded-full border-2 border-black/40 border-t-black" />
                Verifying…
              </span>
            ) : (
              <><Lock className="mr-2 size-4" /> Sign in</>
            )}
          </Button>
        </form>

        <div className="flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
          <Link to="/login" className="hover:text-foreground">← User sign in</Link>
          <Link to="/" className="hover:text-foreground">Back to site</Link>
        </div>
      </div>
    </div>
  );
}
