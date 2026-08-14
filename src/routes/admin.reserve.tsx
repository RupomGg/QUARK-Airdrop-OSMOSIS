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
  const [loading, setLoading] = useState(true);
  const [vToken, setVToken] = useState("");
  const [amount, setAmount] = useState(1000);
  const [action, setAction] = useState<"mint" | "burn">("mint");

  const loadData = async () => {
    try {
      const res = await contractAPI.getStatus();
      setReserves(res.status.voucherReserve || {});
      setSupply(res.status.voucherSupply || {});
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
    try {
      const res = action === "mint" 
        ? await adminAPI.mintReserve(vToken, amount) 
        : await adminAPI.burnReserve(vToken, amount);
        
      if (res.success) {
        toast.success(`Successfully ${action === "mint" ? "minted" : "burned"} ${amount} ${vToken}`);
        loadData();
      } else {
        toast.error(res.message || "Action failed");
      }
    } catch (err) {
      toast.error("An error occurred");
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
            <div className="mt-2 text-sm text-muted-foreground">Total Supply: <span className="font-medium text-foreground">{fmt(supply[t])}</span></div>
            <div className="text-sm text-muted-foreground">Reserve: <span className="font-medium text-foreground">{fmt(reserves[t])}</span></div>
            <div className="text-sm text-muted-foreground">Circulating: <span className="font-medium text-foreground">{fmt((supply[t] || 0) - (reserves[t] || 0))}</span></div>
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
        <button type="submit" className="w-full rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground">
          Confirm
        </button>
      </form>
    </div>
  );
}
