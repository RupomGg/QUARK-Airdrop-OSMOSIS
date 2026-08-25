import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useStore, fmt } from "@/lib/store";
import { KNOWN_REAL_DENOMS } from "@/lib/cosmos/realDenoms";
import {
  Ticket,
  Coins,
  Lock,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Gift,
  ArrowRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";

export const Route = createFileRoute("/app/")({
  component: Dashboard,
});

const series = Array.from({ length: 14 }).map((_, i) => ({
  d: `Day ${i + 1}`,
  v: 1_200_000 + Math.round(Math.sin(i / 2) * 400_000 + i * 80_000),
  redeem: 200_000 + Math.round(Math.cos(i / 2) * 80_000 + i * 10_000),
}));

function Dashboard() {
  const { tokens, vouchers, transactions, user } = useStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const totalSupply = Object.values(tokens).reduce((s, t) => s + t.supply * t.price, 0);
  const active = vouchers.filter((v) => v.status === "active").length;

  // Real voucher tokens sitting in the connected wallet, ready to redeem for
  // their real underlying asset — most commonly landed there via a direct
  // admin airdrop rather than this app's own mint flow, so there's no
  // DBVoucher record and nothing else on the dashboard would ever surface
  // them. Without this, a recipient has no way to discover that redeeming
  // is even possible short of being told where to click.
  const redeemableAirdrops = Object.keys(KNOWN_REAL_DENOMS)
    .map((base) => "v" + base)
    .map((symbol) => ({ symbol, balance: tokens[symbol]?.userBalance || 0 }))
    .filter((t) => t.balance > 0);

  const stats = [
    { k: "Total Vouchers", v: vouchers.length.toLocaleString(), sub: `${active} active`, icon: Ticket, color: "text-primary-foreground" },
    { k: "Total Supply", v: `$${(totalSupply / 1_000_000).toFixed(2)}M`, sub: "Across all tokens", icon: Coins },
    { k: "Total Value Locked", v: "$18.42M", sub: "Across all pools", icon: Lock },
    { k: "Transactions", v: "8,432", sub: "All time", icon: Activity },
  ];

  const chartColors = ["#7c5cff", "#22d3ee", "#34d399", "#f59e0b", "#ef4444"];
  const pie = Object.values(tokens).map((t, i) => ({
    name: t.symbol,
    value: Math.round((t.supply * t.price) / 1000),
    color: chartColors[i % chartColors.length],
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Welcome back, {user.name}</p>
      </div>

      {redeemableAirdrops.length > 0 && (
        <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-primary/40 bg-primary/10 p-5 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/20 p-2 text-primary-foreground">
              <Gift className="size-5" />
            </div>
            <div>
              <div className="font-semibold">
                You have{" "}
                {redeemableAirdrops.map((t, i) => (
                  <span key={t.symbol}>
                    {i > 0 && ", "}
                    {fmt(t.balance)} {t.symbol}
                  </span>
                ))}{" "}
                ready to redeem
              </div>
              <div className="text-sm text-muted-foreground">
                These tokens are already in your wallet — redeem them now for the real underlying asset.
              </div>
            </div>
          </div>
          <Link
            to="/app/swap"
            search={{ redeem: redeemableAirdrops[0].symbol }}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Redeem now <ArrowRight className="size-4" />
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <div key={s.k} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">{s.k}</div>
                <div className="mt-2 text-2xl font-bold">{s.v}</div>
                <div className="mt-1 text-xs text-muted-foreground">{s.sub}</div>
              </div>
              <div className="rounded-lg bg-primary/15 p-2 text-primary-foreground">
                <s.icon className="size-4" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Voucher Activity (14D)</h2>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span><span className="mr-1 inline-block size-2 rounded-full bg-chart-1" />Minted</span>
              <span><span className="mr-1 inline-block size-2 rounded-full bg-chart-3" />Redeemed</span>
            </div>
          </div>
          <div style={{ width: "100%", height: 260 }}>
            {mounted && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series}>
                <defs>
                  <linearGradient id="cv1" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#7c5cff" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#7c5cff" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="cv2" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="d" stroke="#6b7280" fontSize={11} />
                <YAxis stroke="#6b7280" fontSize={11} />
                <Tooltip contentStyle={{ background: "#0b0b14", border: "1px solid #1f2937", borderRadius: 8 }} />
                <Area dataKey="v" stroke="#7c5cff" fill="url(#cv1)" />
                <Area dataKey="redeem" stroke="#34d399" fill="url(#cv2)" />
              </AreaChart>
            </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 font-semibold">Supply Overview</h2>
          <div style={{ width: "100%", height: 220 }}>
            {mounted && (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pie} dataKey="value" innerRadius={60} outerRadius={90} paddingAngle={3}>
                  {pie.map((p, i) => <Cell key={i} fill={p.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#0b0b14", border: "1px solid #1f2937", borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
            )}
          </div>
          <div className="space-y-2">
            {pie.map((p) => (
              <div key={p.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: p.color }} />{p.name}</span>
                <span className="text-muted-foreground">${fmt(p.value)}K</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Recent Transactions</h2>
            <Link to="/app/transactions" className="text-xs text-primary-foreground hover:underline">View all</Link>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr><th className="py-2">Type</th><th>Token</th><th>Amount</th><th>Hash</th><th>Time</th></tr>
            </thead>
            <tbody>
              {transactions.slice(0, 6).map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="py-3 capitalize">
                    <span className="inline-flex items-center gap-1.5">
                      {t.type === "mint" ? <ArrowUpRight className="size-3.5 text-success" /> : <ArrowDownRight className="size-3.5 text-primary-foreground" />}
                      {t.type}
                    </span>
                  </td>
                  <td className="font-mono">{t.token}</td>
                  <td>{fmt(t.amount)}</td>
                  <td className="font-mono text-muted-foreground">{t.hash}</td>
                  <td className="text-muted-foreground">{timeAgo(t.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 font-semibold">Wallet Activity</h2>
          <div className="space-y-3">
            <Stat label="Connected Wallets" value="1.2k" />
            <Stat label="Active Wallets (24h)" value="328" />
            <Stat label="Total Balance" value="$4.82M" />
          </div>
          <Link to="/app/wallet" className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            View All Wallets
          </Link>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

export function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
