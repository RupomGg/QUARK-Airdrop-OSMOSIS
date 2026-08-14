import { createFileRoute } from "@tanstack/react-router";
import { useStore, fmt } from "@/lib/store";
import { Vault, Shield, TrendingUp, CheckCircle, AlertCircle, Copy, ExternalLink } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { timeAgo } from "@/routes/app.index";
import { useState, useEffect } from "react";
import { auditAPI } from "@/lib/api";
import { getTreasuryBalance } from "@/api/cosmos/treasury.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/treasury")({
  component: Treasury,
});

const liq = Array.from({ length: 12 }).map((_, i) => ({
  m: `M${i + 1}`,
  in: 200 + Math.round(Math.sin(i) * 60 + i * 15),
  out: 180 + Math.round(Math.cos(i) * 50 + i * 10),
}));

// VITE_ prefix exposes this to the browser bundle at build time
const KNOWN_TREASURY_ADDRESS = import.meta.env.VITE_TREASURY_ADDRESS || "";

function Treasury() {
  const { tokens } = useStore();
  const [audit, setAudit] = useState<any[]>([]);

  // Initialise with the known address immediately — no server round-trip needed
  const [treasury, setTreasury] = useState<{
    configured: boolean;
    address: string | null;
    balanceOSMO: number;
    tokens: { denom: string; amount: number }[];
    rpcError?: string | null;
  }>({
    configured: Boolean(KNOWN_TREASURY_ADDRESS),
    address: KNOWN_TREASURY_ADDRESS || null,
    balanceOSMO: 0,
    tokens: [],
  });
  const [loading, setLoading] = useState(Boolean(KNOWN_TREASURY_ADDRESS));

  const fetchBalance = useServerFn(getTreasuryBalance);

  useEffect(() => {
    auditAPI.getLogs().then(res => setAudit(res.logs || [])).catch(() => {});
  }, []);

  useEffect(() => {
    console.log("[treasury UI] calling fetchBalance...");
    fetchBalance()
      .then((res) => {
        console.log("[treasury UI] fetchBalance success:", res);
        // Merge server result but keep the known address if server returns null
        setTreasury({
          ...res,
          configured: Boolean(KNOWN_TREASURY_ADDRESS) || res.configured,
          address: res.address || KNOWN_TREASURY_ADDRESS || null,
        });
        setLoading(false);
      })
      .catch((err) => {
        console.error("[treasury UI] fetchBalance failed:", err);
        // Keep the known address — just mark balance as unavailable
        setTreasury(prev => ({ 
          ...prev, 
          configured: Boolean(KNOWN_TREASURY_ADDRESS),
          address: KNOWN_TREASURY_ADDRESS || null,
          rpcError: err?.message || String(err) 
        }));
        setLoading(false);
      });
  }, [fetchBalance]);

  const total = Object.values(tokens).reduce((s, t) => s + t.supply * t.price, 0);
  const funded = (treasury?.balanceOSMO || 0) >= 1100;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Treasury & Audit</h1>
        <p className="text-sm text-muted-foreground">Protocol health, liquidity, and audit trail.</p>
      </div>

      {/* Treasury Wallet Status */}
      {treasury?.configured && (
        <div className={`rounded-xl border p-5 ${funded ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
          <div className="flex items-start justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {funded ? (
                  <CheckCircle className="size-5 text-emerald-400" />
                ) : (
                  <AlertCircle className="size-5 text-amber-400" />
                )}
                <span className="font-semibold">
                  {funded ? "Treasury Funded" : "Treasury Needs Funding"}
                </span>
              </div>
              <div className="font-mono text-sm">{treasury.address}</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(treasury.address || "");
                    toast.success("Address copied");
                  }}
                  className="rounded-md border border-border bg-card px-2 py-1 text-xs hover:bg-accent flex items-center gap-1"
                >
                  <Copy className="size-3" /> Copy
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      try {
                        const resp = await fetch('/api/explorer/check', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ address: treasury.address }),
                        });
                        const data = await resp.json();
                        const okUrls = Object.keys(data.results || {}).filter((u) => data.results[u]);
                        const target = okUrls[0] || `https://www.mintscan.io/osmosis/address/${treasury.address}`;
                        const win = window.open(target, '_blank', 'noopener,noreferrer');
                        if (!win) {
                          // popup blocked — open fallback (no-www)
                          window.open(`https://mintscan.io/osmosis/address/${treasury.address}`, '_blank');
                        }
                      } catch (e) {
                        // On error, open the primary link as fallback
                        window.open(`https://www.mintscan.io/osmosis/address/${treasury.address}`, '_blank');
                      }
                    }}
                    className="rounded-md border border-border bg-card px-2 py-1 text-xs hover:bg-accent flex items-center gap-1"
                  >
                    <ExternalLink className="size-3" /> Open on Mintscan
                  </button>

                  <a
                    href={`https://mintscan.io/osmosis/address/${treasury.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md border border-border bg-card px-2 py-1 text-xs hover:bg-accent flex items-center gap-1"
                    title="Fallback (no-www)"
                  >
                    <ExternalLink className="size-3" /> Mintscan (no-www)
                  </a>
                  <a
                    href={`https://www.mintscan.io/osmosis/account/${treasury.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md border border-border bg-card px-2 py-1 text-xs hover:bg-accent flex items-center gap-1"
                    title="Alternate account view"
                  >
                    <ExternalLink className="size-3" /> Account view
                  </a>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold">{fmt(treasury.balanceOSMO)} OSMO</div>
              <div className="text-sm text-muted-foreground">
                {funded
                  ? "Ready for Token Factory + Pool creation"
                  : `Need ${fmt(Math.max(0, 1100 - treasury.balanceOSMO))} more OSMO`}
              </div>
            </div>
          </div>

          {treasury.rpcError && (
            <div className="mt-3 rounded border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-400">
              ⚠️ RPC Error: {treasury.rpcError}
            </div>
          )}

          {treasury.tokens.length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Factory Tokens</div>
              <div className="flex flex-wrap gap-2">
                {treasury.tokens.map((t) => (
                  <span key={t.denom} className="rounded-full border border-border bg-card px-3 py-1 text-xs">
                    {t.denom.split("/").pop()}: {fmt(t.amount)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!treasury?.configured && !loading && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
          <div className="flex items-center gap-2 text-amber-400">
            <AlertCircle className="size-5" />
            <span className="font-semibold">Treasury Address Not Set</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Add VITE_TREASURY_ADDRESS to your .env file to display the treasury wallet.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card icon={Vault} label="Treasury Value" value={`$${fmt(total / 1_000_000)}M`} sub="All reserves" />
        <Card icon={TrendingUp} label="Total Reserves" value="$12.78M" sub="Liquid + locked" />
        <Card icon={Shield} label="Health Factor" value="2.41" sub="Healthy" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-6 lg:col-span-2">
          <h2 className="mb-4 font-semibold">Liquidity Flow</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={liq}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="m" stroke="var(--color-muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
              <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
              <Bar dataKey="in" fill="var(--color-chart-3)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="out" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-4 font-semibold">Reserve Assets</h2>
          <div className="space-y-3">
            {Object.values(tokens).map((t) => (
              <div key={t.symbol} className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{t.symbol}</span>
                  <span>${fmt(t.supply * t.price / 1_000_000)}M</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{fmt(t.supply)} {t.symbol}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 font-semibold">Audit Log</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr><th className="py-2">Actor</th><th>Action</th><th className="text-right">When</th></tr>
          </thead>
          <tbody>
            {audit.map((a, i) => (
              <tr key={i} className="border-t border-border">
                <td className="py-3"><span className="rounded-md bg-primary/15 px-2 py-0.5 text-xs text-primary-foreground">{a.user_id === "you" ? "System" : "Admin"}</span></td>
                <td>{a.action}</td>
                <td className="text-right text-muted-foreground">{timeAgo(a.timestamp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="mt-2 text-2xl font-bold">{value}</div>
          <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
        </div>
        <div className="rounded-lg bg-primary/15 p-2 text-primary-foreground">
          <Icon className="size-4" />
        </div>
      </div>
    </div>
  );
}

