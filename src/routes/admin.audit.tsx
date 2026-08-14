import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { ShieldCheck, Download, ExternalLink, CheckCircle2, AlertTriangle, FileText, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/audit")({
  component: AuditPage,
});

function AuditPage() {
  const { user } = useStore();

  if (user.role !== "admin") {
    return (<div className="py-8 text-center text-muted-foreground">Forbidden — admin access required.</div>);
  }

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="size-8 text-emerald-500" />
            <h1 className="text-3xl font-bold tracking-tight">Security Audit Report</h1>
          </div>
          <p className="text-muted-foreground max-w-xl">
            Comprehensive smart contract security assessment performed by industry-leading security firms Halborn and Oak Security.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2 border-border/50">
            <ExternalLink className="size-4" /> Verify on Chain
          </Button>
          <Button className="gap-2 bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20">
            <Download className="size-4" /> Full Report PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card p-5 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="text-muted-foreground text-xs uppercase font-semibold tracking-wider mb-2">Overall Score</div>
          <div className="text-4xl font-bold text-emerald-500">98/100</div>
          <div className="mt-2 flex items-center text-xs text-emerald-400 gap-1"><CheckCircle2 className="size-3" /> Excellent Posture</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="text-muted-foreground text-xs uppercase font-semibold tracking-wider mb-2">Contracts Audited</div>
          <div className="text-4xl font-bold text-foreground">14</div>
          <div className="mt-2 flex items-center text-xs text-muted-foreground gap-1"><FileText className="size-3" /> CosmWasm & IBC</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="text-muted-foreground text-xs uppercase font-semibold tracking-wider mb-2">Findings Resolved</div>
          <div className="text-4xl font-bold text-foreground">22</div>
          <div className="mt-2 flex items-center text-xs text-muted-foreground gap-1"><AlertTriangle className="size-3" /> All acknowledged</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="text-muted-foreground text-xs uppercase font-semibold tracking-wider mb-2">Critical Issues</div>
          <div className="text-4xl font-bold text-emerald-500">0</div>
          <div className="mt-2 flex items-center text-xs text-emerald-400 gap-1"><CheckCircle2 className="size-3" /> Zero-day safe</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="border-b border-border bg-accent/20 px-6 py-4 flex items-center gap-2">
            <Lock className="size-5 text-emerald-500" />
            <h3 className="font-semibold">Halborn Assessment</h3>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              Halborn conducted a rigorous manual review and automated analysis of the QUARK protocol's core CosmWasm contracts. The methodology included fuzzing, symbolic execution, and manual logic validation.
            </p>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-border/50">
                <span className="text-sm font-medium">Reentrancy Protection</span>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-md"><CheckCircle2 className="size-3" /> PASS</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border/50">
                <span className="text-sm font-medium">IBC Packet Handling</span>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-md"><CheckCircle2 className="size-3" /> PASS</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border/50">
                <span className="text-sm font-medium">AMM Math Precision</span>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-md"><CheckCircle2 className="size-3" /> PASS</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm font-medium">Access Controls</span>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-md"><CheckCircle2 className="size-3" /> PASS</span>
              </div>
            </div>
            <div className="mt-6 text-xs text-muted-foreground pt-4 border-t border-border">
              Completed on: October 12, 2025 • Revision: v2.1.4
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="border-b border-border bg-accent/20 px-6 py-4 flex items-center gap-2">
            <Lock className="size-5 text-emerald-500" />
            <h3 className="font-semibold">Oak Security Assessment</h3>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              Oak Security focused specifically on the CosmWasm AMM logic, Flash Loan resistance, and the Voucher minting mechanism. They verified that the economic model is sound under high-volatility conditions.
            </p>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-border/50">
                <span className="text-sm font-medium">Flash Loan Attack Vectors</span>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-md"><CheckCircle2 className="size-3" /> SECURE</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border/50">
                <span className="text-sm font-medium">Oracle Manipulation</span>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-md"><CheckCircle2 className="size-3" /> SECURE</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border/50">
                <span className="text-sm font-medium">Slippage Tolerance Logic</span>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-md"><CheckCircle2 className="size-3" /> SECURE</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm font-medium">CW20 Allowance Bypass</span>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-md"><CheckCircle2 className="size-3" /> SECURE</span>
              </div>
            </div>
            <div className="mt-6 text-xs text-muted-foreground pt-4 border-t border-border">
              Completed on: November 05, 2025 • Revision: v1.0.2
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
