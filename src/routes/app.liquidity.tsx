import { createFileRoute } from "@tanstack/react-router";
import { useStore, fmt, type ContractStatus } from "@/lib/store";
import { Droplets, TrendingUp, ExternalLink, Globe, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { adminAPI, osmosisAPI } from "@/lib/api";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/app/liquidity")({
  component: LiquidityPage,
});

const series = Array.from({ length: 14 }).map((_, i) => ({
  d: `D${i + 1}`,
  v: 8_000_000 + Math.round(Math.sin(i / 1.6) * 1_400_000 + i * 120_000),
}));

function LiquidityPage() {
  const { contractStatus, refreshAppState } = useStore();
  const [loading, setLoading] = useState<string | null>(null);

  const [newPair, setNewPair] = useState("");

  // Real Osmosis DEX pool query state
  const [dexPools, setDexPools] = useState<any[]>([]);
  const [dexStatus, setDexStatus] = useState<{ message: string; configured: boolean; lcdReachable?: boolean } | null>(null);
  const [dexLoading, setDexLoading] = useState(false);

  const checkDexPools = async () => {
    setDexLoading(true);
    try {
      const result = await osmosisAPI.getPools();
      setDexPools(result.pools ?? []);
      setDexStatus({
        message: result.message || "",
        configured: result.configured ?? false,
        lcdReachable: result.lcdReachable ?? true,
      });
    } catch (e: any) {
      setDexStatus({ message: e.message || "Failed to query DEX pools", configured: false });
    } finally {
      setDexLoading(false);
    }
  };

  // Auto-check on mount
  useEffect(() => { void checkDexPools(); }, []);

  const realPools = Object.entries(contractStatus.pools).map(([pair, p]) => {
    return {
      pair,
      tvl: p.reserveA + p.reserveB,
      apr: 12.5,
      vol: (p.reserveA + p.reserveB) * 0.05,
      util: p.reserveA > 0 && p.reserveB > 0 ? 45 : 0,
    };
  });

  const handleAddLiquidity = async (pair: string) => {
    try {
      setLoading(pair);
      await adminAPI.addLiquidity(pair, 100000, 100000);
      await refreshAppState();
      toast.success(`Added 100K liquidity to ${pair}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to add liquidity");
    } finally {
      setLoading(null);
    }
  };

  const handleRemoveLiquidity = async (pair: string) => {
    try {
      setLoading(pair + "-rm");
      await adminAPI.removeLiquidity(pair, 50000, 50000);
      await refreshAppState();
      toast.success(`Removed 50K liquidity from ${pair}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to remove liquidity");
    } finally {
      setLoading(null);
    }
  };

  const handleCreatePool = async () => {
    if (!newPair) return toast.error("Pair required");
    try {
      setLoading("create");
      await adminAPI.createPool(newPair.toUpperCase());
      await refreshAppState();
      toast.success(`Created pool ${newPair}`);
      setNewPair("");
    } catch (e: any) {
      toast.error(e.message || "Failed to create pool");
    } finally {
      setLoading(null);
    }
  };

  const handleDeletePool = async (pair: string) => {
    try {
      setLoading(pair + "-del");
      await adminAPI.deletePool(pair);
      await refreshAppState();
      toast.success(`Deleted pool ${pair}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to delete pool");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Liquidity Pools</h1>
        <p className="text-sm text-muted-foreground">Manage protocol-owned liquidity and incentives.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card label="Total Liquidity" value="$18.42M" sub="+4.2% 24h" icon={Droplets} />
        <Card label="24h Volume" value="$2.31M" sub="412 trades" icon={TrendingUp} />
        <Card label="Avg Pool APR" value="22.8%" sub="Across all pools" icon={TrendingUp} />
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 font-semibold">Liquidity Trend (14D)</h2>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={series}>
            <defs>
              <linearGradient id="lq" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--color-chart-2)" stopOpacity={0.6} />
                <stop offset="100%" stopColor="var(--color-chart-2)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="d" stroke="var(--color-muted-foreground)" fontSize={11} />
            <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
            <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
            <Area dataKey="v" stroke="var(--color-chart-2)" fill="url(#lq)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-col sm:flex-row items-center justify-between border-b border-border px-6 py-4 gap-4">
          <h2 className="font-semibold">Active Pools</h2>
          <div className="flex items-center gap-2">
            <Input placeholder="vABC/vXYZ" value={newPair} onChange={(e) => setNewPair(e.target.value)} className="w-40 h-9" />
            <Button size="sm" onClick={handleCreatePool} disabled={loading === "create"}>Create Pool</Button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-6 py-3">Pool</th><th>TVL</th><th>APR</th><th>24h Vol</th><th>Utilization</th><th className="px-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {realPools.map((p) => (
              <tr key={p.pair} className="border-t border-border">
                <td className="px-6 py-4 font-mono">{p.pair}</td>
                <td>${fmt(p.tvl)}</td>
                <td className="text-success">{p.apr.toFixed(1)}%</td>
                <td>${fmt(p.vol)}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-background">
                      <div className="h-full rounded-full bg-gradient-to-r from-primary to-chart-5" style={{ width: `${p.util}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground">{p.util}%</span>
                  </div>
                </td>
                <td className="px-6 text-right space-x-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={loading === p.pair}
                    onClick={() => handleAddLiquidity(p.pair)}
                  >
                    Add
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={loading === p.pair + "-rm"}
                    onClick={() => handleRemoveLiquidity(p.pair)}
                  >
                    Remove
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={loading === p.pair + "-del"}
                    onClick={() => handleDeletePool(p.pair)}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
            {realPools.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                  No liquidity pools available. Create one or generate a voucher.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Real Osmosis DEX Pool Visibility Section */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-col sm:flex-row items-center justify-between border-b border-border px-6 py-4 gap-3">
          <div className="flex items-center gap-2">
            <Globe className="size-4 text-primary-foreground" />
            <h2 className="font-semibold">On-Chain DEX Pool Visibility</h2>
          </div>
          <Button size="sm" variant="outline" onClick={checkDexPools} disabled={dexLoading}>
            {dexLoading ? <RefreshCw className="mr-2 size-3 animate-spin" /> : <RefreshCw className="mr-2 size-3" />}
            Check DEX Pools
          </Button>
        </div>

        <div className="px-6 py-4">
          {dexStatus && (
            <div className={`mb-4 flex items-start gap-2 rounded-lg border p-3 text-sm ${
              dexPools.length > 0
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : dexStatus.configured
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                  : "border-border bg-background text-muted-foreground"
            }`}>
              {dexPools.length > 0 ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              ) : (
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
              )}
              <div>
                <div className="font-medium">{dexStatus.message}</div>
                <div className="mt-1 text-xs opacity-80">
                  LCD: {dexStatus.lcdReachable !== false ? "✅ Reachable" : "❌ Unreachable"} ·
                  Treasury: {dexStatus.configured ? "✅ Configured" : "⚠️ Not configured (set OSMO_TREASURY_MNEMONIC)"}
                </div>
              </div>
            </div>
          )}

          {dexPools.length > 0 ? (
            <div className="space-y-3">
              {dexPools.map((pool: any) => (
                <div key={pool.id} className="rounded-lg border border-border bg-background p-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs uppercase tracking-wider text-muted-foreground">Pool #{pool.id}</span>
                        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary-foreground">
                          {pool.type}
                        </span>
                      </div>
                      <div className="mt-1 space-y-1">
                        {pool.denoms.map((d: string) => (
                          <div key={d} className="font-mono text-xs text-muted-foreground">{d}</div>
                        ))}
                      </div>
                      {pool.swapFee && (
                        <div className="mt-1 text-xs text-muted-foreground">Swap fee: {(Number(pool.swapFee) * 100).toFixed(2)}%</div>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <a href={pool.mintscanUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-accent">
                        Mintscan <ExternalLink className="size-3" />
                      </a>
                      <a href={pool.lcpUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/20">
                        Osmosis DEX <ExternalLink className="size-3" />
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {dexLoading ? "Querying Osmosis LCD…" : "No factory denom pools found on the Osmosis DEX yet."}
            </div>
          )}
        </div>
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

