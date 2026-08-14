import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Logo } from "@/components/logo";
import { Loader2, Lock } from "lucide-react";
import { authAPI } from "@/lib/api";

export const Route = createFileRoute("/reset-password")({ component: ResetPage });

function ResetPage() {
  const navigate = useNavigate();
  const [token, setToken] = useState("");
  const [pw, setPw] = useState("");
  const [c, setC] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return toast.error("Reset token required");
    if (pw.length < 6) return toast.error("Min 6 characters");
    if (pw !== c) return toast.error("Passwords do not match");

    setBusy(true);
    try {
      const result = await authAPI.resetPassword(token, pw);
      if (result.success) {
        toast.success("Password updated");
        navigate({ to: "/login" });
      } else {
        toast.error(result.message || "Failed to reset password");
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
          <h1 className="text-2xl font-bold">Set new password</h1>
          <p className="text-sm text-muted-foreground">Enter your reset token and choose a secure password.</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Reset token (from email)</Label>
            <Input type="text" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste reset token" disabled={busy} />
          </div>
          <div className="space-y-2">
            <Label>New password</Label>
            <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} disabled={busy} />
          </div>
          <div className="space-y-2">
            <Label>Confirm password</Label>
            <Input type="password" value={c} onChange={(e) => setC(e.target.value)} disabled={busy} />
          </div>
          <Button type="submit" disabled={busy} className="w-full bg-primary text-primary-foreground hover:opacity-90">
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Lock className="mr-2 size-4" />}
            {busy ? "Updating..." : "Update password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
