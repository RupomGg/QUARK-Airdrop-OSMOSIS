import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useStore, fmt } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Shield, Wallet, Copy } from "lucide-react";
import { StatusBadge } from "@/routes/app.vouchers";
import { timeAgo } from "@/routes/app.index";
import { WalletConnectModal } from "@/components/wallet-connect";

export const Route = createFileRoute("/app/wallet")({
  component: WalletPage,
});

function WalletPage() {
  const { user, tokens, vouchers, transactions, disconnectWallet } = useStore();
  const [walletOpen, setWalletOpen] = useState(false);
  const total = Object.values(tokens).reduce((s, t) => s + t.userBalance * t.price, 0);
  const myActive = vouchers.filter((v) => v.status === "active");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">My Wallet</h1>
          <p className="text-sm text-muted-foreground">Manage your assets and vouchers.</p>
        </div>
        {user.connected ? (
          <Button variant="outline" onClick={() => { disconnectWallet(); toast("Wallet disconnected"); }}>Disconnect</Button>
        ) : (
          <Button onClick={() => setWalletOpen(true)} className="bg-primary text-primary-foreground hover:opacity-90">Connect Wallet</Button>
        )}
      </div>

      <div className="flex justify-between items-center bg-background rounded-lg border border-border p-2">
        <span className="text-xs text-muted-foreground flex items-center gap-2">
          <Shield className="size-4 text-emerald-500" />
          Audit Security: Halborn / Oak Security
        </span>
      </div>

      {user.connected && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-2xl">
              <div className="font-semibold">About QUARK protocol assets</div>
              <p className="mt-1 text-xs text-muted-foreground">
                QUARK reads your Osmosis wallet balances and protocol factory tokens. Native assets stay in Keplr; voucher and protocol activity is recorded through the backend.
              </p>
            </div>
          </div>
        </div>
      )}


      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-gradient-to-br from-primary/30 to-card p-6 lg:col-span-1">
          <Wallet className="size-6 text-primary-foreground" />
          <div className="mt-4 text-xs uppercase tracking-wider text-muted-foreground">Total balance</div>
          <div className="mt-1 text-3xl font-bold">${fmt(total)}</div>
          <button
            onClick={() => { navigator.clipboard.writeText(user.address); toast.success("Address copied"); }}
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs hover:bg-accent"
          >
            <span className="font-mono">{user.address}</span> <Copy className="size-3" />
          </button>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 lg:col-span-2">
          <h2 className="mb-4 font-semibold">Assets</h2>
          <div className="space-y-2">
            {Object.values(tokens).map((t) => (
              <div key={t.symbol} className="flex items-center justify-between rounded-lg border border-border bg-background p-3">
                <div>
                  <div className="font-semibold">{t.symbol}</div>
                  <div className="text-xs text-muted-foreground">{t.name}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{fmt(t.userBalance)}</div>
                  <div className="text-xs text-muted-foreground">${fmt(t.userBalance * t.price)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Voucher Inventory ({myActive.length} active)</h2>
          <Link to="/app/vouchers" className="text-xs text-primary-foreground hover:underline">Manage</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr><th className="py-2">Code</th><th>Token</th><th>Amount</th><th>Status</th><th>Created</th></tr>
            </thead>
            <tbody>
              {vouchers.map((v) => (
                <tr key={v.id} className="border-t border-border">
                  <td className="py-3 font-mono text-xs">{v.code}</td>
                  <td className="font-semibold">{v.token}</td>
                  <td>{fmt(v.amount)}</td>
                  <td><StatusBadge status={v.status} /></td>
                  <td className="text-muted-foreground">{timeAgo(v.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 font-semibold">Recent Activity</h2>
        <div className="space-y-2">
          {transactions.slice(0, 6).map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <div className="capitalize">{t.type} <span className="font-mono text-xs text-muted-foreground">{t.hash}</span></div>
              <div className="text-right">
                <div>{fmt(t.amount)} {t.token}</div>
                <div className="text-xs text-muted-foreground">{timeAgo(t.timestamp)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <WalletConnectModal open={walletOpen} onClose={() => setWalletOpen(false)} onSuccess={() => setWalletOpen(false)} />
    </div>
  );
}
