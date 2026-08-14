import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useStore, fmt, type TokenSymbol } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Ticket, Copy, ArrowRightLeft, CircleCheck, Loader2 } from "lucide-react";
import { timeAgo } from "@/routes/app.index";
import { voucherAPI } from "@/lib/api";

export const Route = createFileRoute("/app/vouchers")({
  component: VouchersPage,
});

function VouchersPage() {
  const { tokens, vouchers, refreshAppState } = useStore();
  const [token, setToken] = useState<TokenSymbol>("");

  useEffect(() => {
    if (!token && Object.keys(tokens).length > 0) setToken(Object.keys(tokens)[0]);
  }, [tokens, token]);
  const [amount, setAmount] = useState("100");
  const [note, setNote] = useState("");
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [transferId, setTransferId] = useState<string | null>(null);
  const [transferTo, setTransferTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setFetchLoading(true);
      await refreshAppState();
      setFetchLoading(false);
    })();
  }, [refreshAppState]);

  const onGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    if (amt > tokens[token].userBalance) return toast.error("Insufficient balance");

    setLoading(true);
    try {
      const result = await voucherAPI.create(token, amt, note || undefined);
      if (result.success && result.voucher) {
        setLastCode(result.voucher.code);
        await refreshAppState();
        toast.success("Voucher generated", { description: result.voucher.code });
        setNote("");
        setAmount("100");
      } else {
        toast.error(result.message || "Failed to create voucher");
      }
    } catch (error) {
      toast.error(String(error));
    } finally {
      setLoading(false);
    }
  };

  const handleRedeem = async (voucherId: string) => {
    setLoading(true);
    try {
      const result = await voucherAPI.redeem(voucherId);
      if (result.success) {
        await refreshAppState();
        toast.success("Voucher redeemed");
      } else {
        toast.error(result.message || "Failed to redeem");
      }
    } catch (error) {
      toast.error(String(error));
    } finally {
      setLoading(false);
    }
  };

  const handleTransfer = async () => {
    if (!transferId) return;
    if (!transferTo) return toast.error("Recipient required");

    setLoading(true);
    try {
      const result = await voucherAPI.transfer(transferId, transferTo);
      if (result.success) {
        await refreshAppState();
        toast.success("Voucher transferred");
        setTransferId(null);
        setTransferTo("");
      } else {
        toast.error(result.message || "Failed to transfer");
      }
    } catch (error) {
      toast.error(String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Voucher Generator</h1>
        <p className="text-sm text-muted-foreground">Issue new transferable vouchers backed by your tokens.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <form onSubmit={onGenerate} className="space-y-4 rounded-xl border border-border bg-card p-6 lg:col-span-2">
          <h2 className="flex items-center gap-2 font-semibold">
            <Ticket className="size-4 text-primary-foreground" /> Generate New Voucher
          </h2>
          <div className="space-y-2">
            <Label>Token</Label>
            <Select value={token} onValueChange={(v) => setToken(v as TokenSymbol)} disabled={loading}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(tokens).map((t) => (
                  <SelectItem key={t.symbol} value={t.symbol}>
                    {t.symbol} — {t.name} (bal: {fmt(t.userBalance)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Amount</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} min={1} disabled={loading} />
          </div>
          <div className="space-y-2">
            <Label>Note (optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Voucher description..." disabled={loading} />
          </div>
          <Button type="submit" disabled={loading} className="w-full bg-primary text-primary-foreground hover:opacity-90">
            {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Generate Voucher
          </Button>
          {lastCode && (
            <div className="flex items-center justify-between rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <CircleCheck className="size-4 text-success" />
                <span className="font-mono">{lastCode}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(lastCode);
                  toast.success("Copied");
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <Copy className="size-4" />
              </button>
            </div>
          )}
        </form>

        <div className="rounded-xl border border-border bg-card p-6 lg:col-span-3">
          <h2 className="mb-4 font-semibold">
            Existing Vouchers ({fetchLoading ? "..." : vouchers.length})
          </h2>
          {fetchLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2">Code</th>
                    <th>Token</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {vouchers.map((v) => (
                    <tr key={v.id} className="border-t border-border">
                      <td className="py-3 font-mono text-xs">{v.code}</td>
                      <td className="font-semibold">{v.token}</td>
                      <td>{fmt(v.amount)}</td>
                      <td>
                        <StatusBadge status={v.status} />
                      </td>
                      <td className="text-muted-foreground">{timeAgo(v.createdAt)}</td>
                      <td className="text-right">
                        {v.status === "active" ? (
                          <div className="inline-flex gap-1">
                            <button
                              onClick={() => handleRedeem(v.id)}
                              className="rounded-md bg-success/15 px-2 py-1 text-xs text-success hover:bg-success/25"
                            >
                              Redeem
                            </button>
                            <button
                              onClick={() => setTransferId(v.id)}
                              className="rounded-md bg-primary/15 px-2 py-1 text-xs text-primary-foreground hover:bg-primary/25"
                            >
                              <ArrowRightLeft className="inline size-3" /> Transfer
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {transferId && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/80 p-4 backdrop-blur" onClick={() => setTransferId(null)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold">Transfer voucher</h3>
            <p className="mt-1 text-xs text-muted-foreground">Send this voucher to another address.</p>
            <Input className="mt-4" placeholder="cosmos1..." value={transferTo} onChange={(e) => setTransferTo(e.target.value)} />
            <div className="mt-4 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setTransferId(null)}>
                Cancel
              </Button>
              <Button className="flex-1 bg-primary text-primary-foreground hover:opacity-90" onClick={handleTransfer}>
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-success/15 text-success",
    redeemed: "bg-muted text-muted-foreground",
    transferred: "bg-primary/15 text-primary-foreground",
    burned: "bg-destructive/15 text-destructive",
    success: "bg-success/15 text-success",
    pending: "bg-warning/15 text-warning",
    failed: "bg-destructive/15 text-destructive",
  };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs capitalize ${map[status] ?? "bg-muted"}`}>{status}</span>;
}
