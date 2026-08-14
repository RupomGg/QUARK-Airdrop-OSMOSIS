import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { adminAPI } from "@/lib/api";

export const Route = createFileRoute("/admin/generator")({
  component: GeneratorPage,
});

function GeneratorPage() {
  const [token, setToken] = useState("");
  const [symbol, setSymbol] = useState("");
  const [decimals, setDecimals] = useState(18);
  const [supply, setSupply] = useState(1000000);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await adminAPI.generateVoucher(token, symbol, decimals, supply);
      if (res.success) {
        toast.success(`Generated voucher ${res.vToken}`);
      } else {
        toast.error(res.message || "Failed to generate voucher");
      }
    } catch (err) {
      toast.error("An error occurred");
    }
    setLoading(false);
  };

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Voucher Generator</h1>
        <p className="text-sm text-muted-foreground">Generate a voucher version of any token.</p>
      </div>
      <form onSubmit={handleGenerate} className="space-y-4 rounded-xl border border-border bg-card p-6">
        <div>
          <label className="mb-1 block text-sm font-medium">Base Token Name</label>
          <input type="text" value={token} onChange={e => setToken(e.target.value)} required className="w-full rounded-md border border-input bg-transparent px-3 py-2" placeholder="e.g. ABC" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Symbol</label>
          <input type="text" value={symbol} onChange={e => setSymbol(e.target.value)} required className="w-full rounded-md border border-input bg-transparent px-3 py-2" placeholder="e.g. vABC" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Decimals</label>
          <input type="number" value={decimals} onChange={e => setDecimals(Number(e.target.value))} required className="w-full rounded-md border border-input bg-transparent px-3 py-2" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Total Supply</label>
          <input type="number" value={supply} onChange={e => setSupply(Number(e.target.value))} required className="w-full rounded-md border border-input bg-transparent px-3 py-2" />
        </div>
        <button type="submit" disabled={loading} className="w-full rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground">
          {loading ? "Generating..." : "Generate Voucher"}
        </button>
      </form>
    </div>
  );
}
