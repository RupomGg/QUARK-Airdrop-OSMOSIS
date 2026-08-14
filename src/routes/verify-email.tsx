import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Logo } from "@/components/logo";
import { Loader2, MailCheck, RefreshCw } from "lucide-react";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/verify-email")({
  validateSearch: (s: Record<string, unknown>) => ({ email: (s.email as string) || "" }),
  component: VerifyPage,
});

function VerifyPage() {
  const { email } = Route.useSearch();
  const navigate = useNavigate();
  const { login } = useStore();
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);

  const verify = async () => {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 1000));
    login(email || "user@quark.io", "user");
    setBusy(false);
    toast.success("Email verified");
    navigate({ to: "/app" });
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-6">
      <div className="absolute inset-0 bg-grid opacity-30" />
      <div className="absolute left-1/2 top-1/3 -z-10 h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
      <div className="relative w-full max-w-md space-y-5 rounded-2xl border border-border bg-card p-8 text-center">
        <Link to="/" className="flex items-center justify-center gap-2">
          <Logo className="size-8" /><span className="font-bold tracking-wide">QUARK</span>
        </Link>
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary/15">
          <MailCheck className="size-7 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Verify your email</h1>
          <p className="text-sm text-muted-foreground">
            We sent a verification link to <span className="font-medium text-foreground">{email || "your inbox"}</span>.
          </p>
        </div>
        <Button onClick={verify} disabled={busy} className="w-full bg-primary text-primary-foreground hover:opacity-90 glow-primary">
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <MailCheck className="mr-2 size-4" />} I've verified my email
        </Button>
        <button
          onClick={() => { setResent(true); toast.success("Verification email re-sent"); }}
          className="flex w-full items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="size-3" /> {resent ? "Sent again" : "Resend email"}
        </button>
      </div>
    </div>
  );
}
