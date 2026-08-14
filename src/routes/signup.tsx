import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Logo } from "@/components/logo";
import { Loader2, UserPlus } from "lucide-react";
import { authAPI, setSessionToken } from "@/lib/api";

export const Route = createFileRoute("/signup")({ component: SignupPage });

function SignupPage() {
  const { login } = useStore();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !name) return toast.error("All fields required");
    if (password.length < 6) return toast.error("Password must be 6+ characters");
    if (password !== confirm) return toast.error("Passwords do not match");

    setBusy(true);
    try {
      const result = await authAPI.signup(email, password, name);
      if (result.success && result.sessionToken) {
        setSessionToken(result.sessionToken);
        login(email, "user");
        toast.success("Account created!");
        navigate({ to: "/verify-email", search: { email } as any });
      } else {
        toast.error(result.message || "Signup failed");
      }
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-6">
      <div className="absolute inset-0 bg-grid opacity-30" />
      <div className="absolute left-1/2 top-1/3 -z-10 h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
      <div className="relative w-full max-w-md space-y-5 rounded-2xl border border-border bg-card p-8">
        <Link to="/" className="flex items-center gap-2">
          <Logo className="size-8" />
          <span className="font-bold tracking-wide">QUARK</span>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Create account</h1>
          <p className="text-sm text-muted-foreground">Join the QUARK Cosmos protocol.</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Full name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Satoshi N." disabled={busy} />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@cosmos.io" disabled={busy} />
          </div>
          <div className="space-y-2">
            <Label>Password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
          </div>
          <div className="space-y-2">
            <Label>Confirm password</Label>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={busy} />
          </div>
          <Button type="submit" disabled={busy} className="w-full bg-primary text-primary-foreground hover:opacity-90 glow-primary">
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <UserPlus className="mr-2 size-4" />}
            {busy ? "Creating..." : "Create account"}
          </Button>
        </form>
        <p className="text-center text-xs text-muted-foreground">
          Already have an account? <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
