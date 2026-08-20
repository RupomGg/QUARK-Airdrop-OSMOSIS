import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { contractAPI, adminAPI } from "@/lib/api";
import { fmt } from "@/lib/store";

export const Route = createFileRoute("/admin/reserve")({
  component: ReservePage,
});

function ReservePage() {
  const [reserves, setReserves] = useState<any>({});
  const [supply, setSupply] = useState<any>({});
  const [onchainReserve, setOnchainReserve] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [vToken, setVToken] = useState("");
  const [amount, setAmount] = useState(1000);
  const [action, setAction] = useState<"mint" | "burn">("mint");
  const [manageLoading, setManageLoading] = useState(false);

  const loadData = async () => {
    try {
      const res = await contractAPI.getStatus();
      setReserves(res.status.voucherReserve || {});
      setSupply(res.status.voucherSupply || {});
      setOnchainReserve(res.status.onchainReserve || {});
      if (!vToken && Object.keys(res.status.voucherSupply || {}).length > 0) {
        setVToken(Object.keys(res.status.voucherSupply)[0]);
      }
    } catch {
      toast.error("Failed to load reserve data");
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleManage = async (e: React.FormEvent) => {
    e.preventDefault();
    setManageLoading(true);
    try {
      const res = action === "mint"
        ? await adminAPI.mintReserve(vToken, amount)
        : await adminAPI.burnReserve(vToken, amount);

      if (res.success) {
        const verb = action === "mint" ? "Minted" : "Burned";
        if (res.onchainTxHash) {
          toast.success(
            <span>
              {verb} {amount} {vToken} on-chain.{" "}
              <a href={res.mintscanUrl} target="_blank" rel="noopener noreferrer" className="underline">
                View on Mintscan
              </a>
            </span>,
          );
        } else if (res.onchainError) {
          toast.warning(`Simulated only — ${res.onchainError}`);
        } else {
          toast.success(`${verb} ${amount} ${vToken} (simulated).`);
        }
        loadData();
      } else {
        toast.error(res.message || "Action failed");
      }
    } catch (err) {
      toast.error("An error occurred");
    } finally {
      setManageLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Voucher Reserve Supply</h1>
        <p className="text-sm text-muted-foreground">Manage total voucher supply and circulating reserves.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Object.keys(supply).map(t => (
          <div key={t} className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-semibold text-lg">{t}</h3>

            {/* The real, exact balance — the only figure backed by the
                blockchain. */}
            <div className="mt-2 text-2xl font-bold text-foreground">
              {onchainReserve[t] !== undefined ? fmt(onchainReserve[t]) : "—"}
            </div>
            <div className="text-xs text-muted-foreground">
              {onchainReserve[t] !== undefined
                ? "real balance on Osmosis"
                : "no real Token Factory denom on-chain for this token yet"}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleManage} className="max-w-md space-y-4 rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold text-lg">Manage Supply</h2>
        <div>
          <label className="mb-1 block text-sm font-medium">Voucher Token</label>
          <select value={vToken} onChange={e => setVToken(e.target.value)} className="w-full rounded-md border border-input bg-transparent px-3 py-2">
            {Object.keys(supply).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Action</label>
          <select value={action} onChange={e => setAction(e.target.value as any)} className="w-full rounded-md border border-input bg-transparent px-3 py-2">
            <option value="mint">Increase Reserve (Mint)</option>
            <option value="burn">Decrease Reserve (Burn)</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Amount</label>
          <input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} required className="w-full rounded-md border border-input bg-transparent px-3 py-2" />
        </div>
        <button
          type="submit"
          disabled={manageLoading}
          className="w-full rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-60"
        >
          {manageLoading ? "Processing..." : "Confirm"}
        </button>
      </form>
    </div>
  );
}
