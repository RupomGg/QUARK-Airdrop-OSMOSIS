import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useStore, fmt, type TokenSymbol } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Send as SendIcon, Ticket } from "lucide-react";
import { StatusBadge } from "@/routes/app.vouchers";
import { timeAgo } from "@/routes/app.index";
import { transactionAPI, voucherAPI, mintscanTxUrl } from "@/lib/api";
import { getRealDenom, toMicroUnits } from "@/lib/cosmos/realDenoms";
import { sendViaKeplr } from "@/lib/cosmos/keplr";
import { buildFactoryDenom, voucherSubdenom } from "@/lib/cosmos/denom";

const TREASURY_ADDRESS = (import.meta as any).env?.VITE_TREASURY_ADDRESS || "";

export const Route = createFileRoute("/app/send")({
  component: SendRedeemPage,
});

function SendRedeemPage() {
  const { user, tokens, vouchers, refreshAppState, transactions } = useStore();
  const [token, setToken] = useState<TokenSymbol>("");

  useEffect(() => {
    if (!token && Object.keys(tokens).length > 0) setToken(Object.keys(tokens)[0]);
  }, [tokens, token]);
  const [amount, setAmount] = useState("10");
  const [to, setTo] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [voucherCode, setVoucherCode] = useState("");
  const [transferTarget, setTransferTarget] = useState<string | null>(null);
  const [transferAddr, setTransferAddr] = useState("");
  const [loading, setLoading] = useState(false);

  const recent = transactions.filter((t) => ["send", "transfer", "redeem"].includes(t.type)).slice(0, 8);

  const doSend = async () => {
    const a = Number(amount);
    if (!a || a <= 0) return toast.error("Invalid amount");
    if (!to) return toast.error("Recipient required");
    setLoading(true);
    try {
      const result = await transactionAPI.create("send", token, a, { toAddress: to });
      if (result.success) {
        await refreshAppState();
        toast.success(`Sent ${fmt(a)} ${token} to ${to.slice(0, 12)}…`);
        setConfirm(false);
        setTo("");
      } else {
        toast.error(result.message || "Send failed");
      }
    } catch (error) {
      toast.error(String(error));
    } finally {
      setLoading(false);
    }
  };

  const doRedeem = async (codeOrId?: string) => {
    const needle = (codeOrId ?? voucherCode).trim().toLowerCase();
    const v = vouchers.find(
      (x) => x.code.toLowerCase() === needle || x.id.toLowerCase() === needle,
    );
    if (!v) return toast.error("Voucher not found");
    setLoading(true);
    try {
      const real = getRealDenom(v.token);
      if (real) {
        // Backed by a real asset — must redeem on-chain, same as the
        // Voucher → Token flow on the Swap page: send the real voucher
        // tokens back to the treasury, which verifies, burns them, and pays
        // out the real underlying asset. Never silently fall back to a
        // simulated redeem here, or it looks like nothing happened.
        if (!TREASURY_ADDRESS) {
          toast.error("Treasury address is not configured (VITE_TREASURY_ADDRESS).");
          return;
        }
        if (!user.connected || !user.address) {
          toast.error(
            `Connect your Keplr wallet first — redeeming ${v.token} pays out real ${real.label}.`,
          );
          return;
        }

        const voucherDenom = buildFactoryDenom(TREASURY_ADDRESS, voucherSubdenom(v.token));
        const microAmount = toMicroUnits(v.amount, real.exponent);
        let returnTxHash: string;
        try {
          const ret = await sendViaKeplr(
            user.address,
            TREASURY_ADDRESS,
            [{ denom: voucherDenom, amount: microAmount }],
            `QUARK redeem return ${v.token}`,
          );
          returnTxHash = ret.txHash;
        } catch (err) {
          toast.error(
            `Wallet transfer failed: ${err instanceof Error ? err.message : String(err)}`,
          );
          return;
        }

        const result = await voucherAPI.redeemOnchain(v.id, returnTxHash);
        if (result.success) {
          await refreshAppState();
          setVoucherCode("");
          toast.success(`Redeemed ${fmt(v.amount)} ${v.token} → real ${real.label}`, {
            description: result.sendTxHash
              ? `On-chain: ${String(result.sendTxHash).slice(0, 12)}…`
              : undefined,
            action: result.sendTxHash
              ? {
                  label: "Mintscan",
                  onClick: () =>
                    window.open(
                      result.mintscanUrl || mintscanTxUrl(result.sendTxHash),
                      "_blank",
                      "noopener",
                    ),
                }
              : undefined,
          });
        } else {
          toast.error(result.message || "On-chain redemption failed");
        }
        return;
      }

      const result = await voucherAPI.redeem(v.id);
      if (result.success) {
        await refreshAppState();
        toast.success(`Redeemed ${fmt(v.amount)} ${v.token}`);
        setVoucherCode("");
      } else {
        toast.error(result.message || "Voucher redeem failed");
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
        <h1 className="text-2xl font-bold">Send / Redeem</h1>
        <p className="text-sm text-muted-foreground">Move tokens or redeem vouchers on-chain.</p>
      </div>

      <Tabs defaultValue="send">
        <TabsList>
          <TabsTrigger value="send"><SendIcon className="mr-2 size-4" /> Send Tokens</TabsTrigger>
          <TabsTrigger value="redeem"><Ticket className="mr-2 size-4" /> Redeem Voucher</TabsTrigger>
          <TabsTrigger value="transfer">Transfer Voucher</TabsTrigger>
        </TabsList>

        <TabsContent value="send" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 rounded-xl border border-border bg-card p-6 lg:col-span-1">
              <div className="space-y-2">
                <Label>Token</Label>
                <Select value={token} onValueChange={(v) => setToken(v as TokenSymbol)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.values(tokens).map((t) => <SelectItem key={t.symbol} value={t.symbol}>{t.symbol} (bal: {fmt(t.userBalance)})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Amount</Label>
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Recipient address</Label>
                <Input placeholder="cosmos1..." value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <Button className="w-full bg-primary text-primary-foreground hover:opacity-90" onClick={() => setConfirm(true)}>Review & Send</Button>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 lg:col-span-2">
              <h2 className="mb-4 font-semibold">Recent Transfers</h2>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="py-2">Type</th><th>Token</th><th>Amount</th><th>To</th><th>Time</th></tr>
                </thead>
                <tbody>
                  {recent.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No transfers yet.</td></tr>}
                  {recent.map((t) => (
                    <tr key={t.id} className="border-t border-border">
                      <td className="py-3 capitalize">{t.type}</td>
                      <td className="font-semibold">{t.token}</td>
                      <td>{fmt(t.amount)}</td>
                      <td className="font-mono text-xs text-muted-foreground">{t.to ?? "—"}</td>
                      <td className="text-muted-foreground">{timeAgo(t.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="redeem" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4 rounded-xl border border-border bg-card p-6">
              <Label>Voucher code</Label>
              <Input placeholder="QRK-XXXX-XXXX" value={voucherCode} onChange={(e) => setVoucherCode(e.target.value)} />
              <Button className="w-full bg-primary text-primary-foreground hover:opacity-90" onClick={() => doRedeem()} disabled={loading}>
                {loading ? "Redeeming…" : "Redeem Voucher"}
              </Button>
              {(() => {
                const needle = voucherCode.trim().toLowerCase();
                const v = needle
                  ? vouchers.find(
                      (x) => x.code.toLowerCase() === needle || x.id.toLowerCase() === needle,
                    )
                  : null;
                if (!v) return null;
                const real = getRealDenom(v.token);
                if (!real)
                  return (
                    <p className="text-[11px] text-muted-foreground">
                      Simulated redemption — {v.token} has no real backing asset configured.
                    </p>
                  );
                if (!TREASURY_ADDRESS)
                  return (
                    <p className="text-[11px] text-amber-400">
                      Simulated — VITE_TREASURY_ADDRESS is not set.
                    </p>
                  );
                if (!user.connected || !user.address)
                  return (
                    <p className="text-[11px] text-amber-400">
                      ⚠️ Connect your Keplr wallet to redeem for real {real.label}.
                    </p>
                  );
                return (
                  <p className="text-[11px] text-emerald-400">
                    ⚡ Real redemption — Keplr will ask you to send {fmt(v.amount)} {v.token} back,
                    then you receive <strong>{real.label}</strong>.
                  </p>
                );
              })()}
              <p className="text-xs text-muted-foreground">Tip: try one of your active codes from the Voucher Generator page.</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="mb-4 font-semibold">Active vouchers</h2>
              <div className="space-y-2">
                {vouchers.filter((v) => v.status === "active").map((v) => (
                  <button key={v.id} onClick={() => setVoucherCode(v.code)} className="flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm hover:border-primary/60">
                    <span className="font-mono text-xs">{v.code}</span>
                    <span>{fmt(v.amount)} {v.token}</span>
                  </button>
                ))}
                {vouchers.filter((v) => v.status === "active").length === 0 && (
                  <p className="text-sm text-muted-foreground">No active vouchers.</p>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="transfer" className="mt-4">
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-4 font-semibold">Transferable vouchers</h2>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr><th className="py-2">Code</th><th>Token</th><th>Amount</th><th>Status</th><th className="text-right">Action</th></tr>
              </thead>
              <tbody>
                {vouchers.map((v) => (
                  <tr key={v.id} className="border-t border-border">
                    <td className="py-3 font-mono text-xs">{v.code}</td>
                    <td className="font-semibold">{v.token}</td>
                    <td>{fmt(v.amount)}</td>
                    <td><StatusBadge status={v.status} /></td>
                    <td className="text-right">
                      {v.status === "active" ? (
                        <button onClick={() => setTransferTarget(v.id)} className="rounded-md bg-primary/15 px-2 py-1 text-xs text-primary-foreground hover:bg-primary/25">Transfer</button>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {confirm && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/80 p-4 backdrop-blur" onClick={() => setConfirm(false)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold">Confirm send</h3>
            <div className="mt-4 space-y-2 rounded-lg border border-border bg-background p-4 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-semibold">{fmt(Number(amount))} {token}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">To</span><span className="font-mono text-xs">{to}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Network fee</span><span>0.001 ATOM</span></div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setConfirm(false)}>Cancel</Button>
              <Button className="flex-1 bg-primary text-primary-foreground hover:opacity-90" onClick={doSend}>Confirm</Button>
            </div>
          </div>
        </div>
      )}

      {transferTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/80 p-4 backdrop-blur" onClick={() => setTransferTarget(null)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold">Transfer voucher</h3>
            <Input className="mt-4" placeholder="cosmos1..." value={transferAddr} onChange={(e) => setTransferAddr(e.target.value)} />
            <div className="mt-4 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setTransferTarget(null)}>Cancel</Button>
              <Button className="flex-1 bg-primary text-primary-foreground hover:opacity-90" onClick={async () => {
                if (!transferAddr) return toast.error("Recipient required");
                if (!transferTarget) return;
                setLoading(true);
                try {
                  const result = await voucherAPI.transfer(transferTarget, transferAddr);
                  if (result.success) {
                    await refreshAppState();
                    toast.success("Voucher transferred");
                    setTransferTarget(null);
                    setTransferAddr("");
                  } else {
                    toast.error(result.message || "Transfer failed");
                  }
                } catch (error) {
                  toast.error(String(error));
                } finally {
                  setLoading(false);
                }
              }}>Confirm</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
