import { createFileRoute } from "@tanstack/react-router";
import { useStore, fmt } from "@/lib/store";
import { StatusBadge } from "@/routes/app.vouchers";
import { timeAgo } from "@/routes/app.index";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { isRealCosmosTxHash, mintscanTxUrl } from "@/lib/api";
import { ExternalLink } from "lucide-react";

export const Route = createFileRoute("/app/transactions")({
  component: TxPage,
});

function TxHashCell({ hash }: { hash: string }) {
  const isReal = isRealCosmosTxHash(hash);
  const short = hash.length > 16 ? `${hash.slice(0, 8)}…${hash.slice(-8)}` : hash;

  if (isReal) {
    return (
      <a
        href={mintscanTxUrl(hash)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 font-mono text-primary-foreground hover:underline"
        title={hash}
      >
        {short}
        <ExternalLink className="size-3 shrink-0" />
      </a>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 font-mono text-muted-foreground" title={hash}>
      {short}
      <span className="rounded bg-muted px-1 text-[9px] uppercase tracking-wider">sim</span>
    </span>
  );
}

function TxPage() {
  const { transactions } = useStore();
  const [q, setQ] = useState("");
  const filtered = transactions.filter((t) =>
    [t.type, t.token, t.hash].some((x) => x.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Transactions</h1>
          <p className="text-sm text-muted-foreground">Complete protocol activity log.</p>
        </div>
        <Input className="w-72" placeholder="Filter by type, token, hash..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-background/40 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="px-4 py-3">Type</th><th>Token</th><th>Amount</th><th>From → To</th><th>Status</th><th>Hash</th><th className="px-4 text-right">Time</th></tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.id} className="border-t border-border hover:bg-accent/30">
                <td className="px-4 py-3 capitalize">{t.type}</td>
                <td className="font-semibold">{t.token}</td>
                <td>{fmt(t.amount)}</td>
                <td className="text-muted-foreground">{t.from && t.to ? `${t.from} → ${t.to}` : "—"}</td>
                <td><StatusBadge status={t.status} /></td>
                <td><TxHashCell hash={t.hash} /></td>
                <td className="px-4 text-right text-muted-foreground">{timeAgo(t.timestamp)}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No transactions match.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}


