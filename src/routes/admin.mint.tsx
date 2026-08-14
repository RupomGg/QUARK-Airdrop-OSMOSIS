import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useStore, fmt, type TokenSymbol } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Flame, Coins } from "lucide-react";
import { transactionAPI } from "@/lib/api";

export const Route = createFileRoute("/admin/mint")({
  component: MintBurn,
});

function MintBurn() {
  const { tokens, user, refreshAppState } = useStore();
  const [loading, setLoading] = useState(false);

  if (user.role !== "admin") {
    return (<div className="py-8 text-center text-muted-foreground">Forbidden — admin access required.</div>);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Token Management</h1>
        <p className="text-sm text-muted-foreground">Mint or burn tokens across the protocol.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {Object.values(tokens).map((t) => (
          <div key={t.symbol} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold">{t.symbol}</div>
                <div className="text-xs text-muted-foreground">{t.name}</div>
              </div>
              <div className={`text-sm ${t.change24h >= 0 ? "text-success" : "text-destructive"}`}>
                {t.change24h >= 0 ? "+" : ""}{t.change24h}%
              </div>
            </div>
            <div className="mt-3 text-2xl font-bold">${fmt(t.price, 6)}</div>
            <div className="mt-1 text-xs text-muted-foreground">Supply: {fmt(t.supply)}</div>
            <div className="mt-1 text-xs text-muted-foreground">Your balance: {fmt(t.userBalance)}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <Tabs defaultValue="mint">
          <TabsList>
            <TabsTrigger value="mint"><Coins className="mr-2 size-4" /> Mint</TabsTrigger>
            <TabsTrigger value="burn"><Flame className="mr-2 size-4" /> Burn</TabsTrigger>
          </TabsList>
          <TabsContent value="mint" className="mt-4">
            <ActionForm action="mint" onSubmit={async (t, a) => {
              setLoading(true);
              try {
                const result = await transactionAPI.create("mint", t, a);
                if (result.success) {
                  toast.success(`Minted ${fmt(a)} ${t}`);
                  await refreshAppState();
                } else {
                  toast.error(result.message || "Mint failed");
                }
              } catch (error) {
                toast.error(String(error));
              } finally {
                setLoading(false);
              }
            }} />
          </TabsContent>
          <TabsContent value="burn" className="mt-4">
            <ActionForm action="burn" onSubmit={async (t, a) => {
              if (a > tokens[t].userBalance) return toast.error("Insufficient balance");
              setLoading(true);
              try {
                const result = await transactionAPI.create("burn", t, a);
                if (result.success) {
                  toast.success(`Burned ${fmt(a)} ${t}`);
                  await refreshAppState();
                } else {
                  toast.error(result.message || "Burn failed");
                }
              } catch (error) {
                toast.error(String(error));
              } finally {
                setLoading(false);
              }
            }} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ActionForm({ action, onSubmit }: { action: string; onSubmit: (t: TokenSymbol, a: number) => void }) {
  const [token, setToken] = useState<TokenSymbol>("");
  const [amount, setAmount] = useState("1000");
  const { tokens } = useStore();

  useEffect(() => {
    if (!token && Object.keys(tokens).length > 0) setToken(Object.keys(tokens)[0]);
  }, [tokens, token]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const a = Number(amount);
        if (!a || a <= 0) return toast.error("Invalid amount");
        onSubmit(token, a);
      }}
      className="grid max-w-2xl gap-4 sm:grid-cols-3"
    >
      <div className="space-y-2 sm:col-span-1">
        <Label>Token</Label>
        <Select value={token} onValueChange={(v) => setToken(v as TokenSymbol)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.values(tokens).map((t) => <SelectItem key={t.symbol} value={t.symbol}>{t.symbol}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2 sm:col-span-1">
        <Label>Amount</Label>
        <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="flex items-end sm:col-span-1">
        <Button type="submit" className="w-full bg-primary text-primary-foreground hover:opacity-90 capitalize">{action} {token}</Button>
      </div>
    </form>
  );
}
