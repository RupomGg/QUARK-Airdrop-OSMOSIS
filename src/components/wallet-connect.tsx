import { useEffect, useState } from "react";
import { useStore, type WalletProvider } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, Loader2, Shield, Wifi, X } from "lucide-react";
import { authAPI, setSessionToken } from "@/lib/api";
import { connectKeplr, readAllBalances, suggestToken } from "@/lib/cosmos/keplr";
import { isFactoryDenom, voucherSubdenom } from "@/lib/cosmos/denom";
import { labelForDenom } from "@/lib/cosmos/realDenoms";

type WalletMeta = {
  id: Exclude<WalletProvider, null>;
  name: string;
  desc: string;
  gradient: string;
  badge?: string;
  installed: boolean;
};

const NETWORKS = [
  { id: "osmosis-1", name: "Osmosis Mainnet", status: "online", latency: 52 },
];

type Stage = "select" | "connecting" | "approve" | "success";

export function WalletConnectModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess?: () => void }) {
  const { user, connectWallet, disconnectWallet } = useStore();
  const [stage, setStage] = useState<Stage>("select");
  const [pending, setPending] = useState<Exclude<WalletProvider, null> | null>(null);
  const [network, setNetwork] = useState(NETWORKS[0].id);

  useEffect(() => {
    if (open) {
      setStage(user.connected ? "success" : "select");
      setPending(null);
    }
  }, [open, user.connected]);

  if (!open) return null;

  const wallets: WalletMeta[] = [
    { id: "keplr", name: "Keplr", desc: "The original Cosmos wallet", gradient: "from-violet-500 via-fuchsia-500 to-pink-500", badge: "Recommended", installed: typeof window !== "undefined" && !!(window as any).keplr },
    { id: "leap", name: "Leap", desc: "Fast multi-chain Cosmos wallet", gradient: "from-emerald-400 to-teal-500", installed: typeof window !== "undefined" && !!(window as any).leap },
    { id: "walletconnect", name: "WalletConnect", desc: "Scan with any mobile wallet", gradient: "from-sky-400 to-blue-600", badge: "Mobile", installed: true },
  ];

  const getWalletAddress = async (id: Exclude<WalletProvider, null>) => {
    if (typeof window !== "undefined") {
      const mockAddr = window.localStorage.getItem("mockWalletAddress");
      if (mockAddr) return mockAddr;
    }
    if (id === "keplr") {
      try {
        const { address } = await connectKeplr();
        return address;
      } catch (err: any) {
        console.warn("Keplr connection failed, falling back to manual entry:", err.message);
        const promptAddress = window.prompt(`Keplr not available. Enter your ${wallets.find((w) => w.id === id)?.name} address (osmo1...)`);
        if (!promptAddress || !promptAddress.startsWith("osmo1")) {
          throw new Error("A valid Osmosis wallet address (osmo1...) is required.");
        }
        return promptAddress;
      }
    }

    const promptAddress = window.prompt(`Enter your ${wallets.find((w) => w.id === id)?.name} address (osmo1...)`);
    if (!promptAddress || !promptAddress.startsWith("osmo1")) {
      throw new Error("A valid Osmosis wallet address (osmo1...) is required.");
    }
    return promptAddress;
  };

  const providerForApi = (id: Exclude<WalletProvider, null>) => (id === "walletconnect" ? "metamask" : id);

  const handlePick = async (id: Exclude<WalletProvider, null>) => {
    setPending(id);
    setStage("connecting");

    try {
      const address = await getWalletAddress(id);
      setStage("approve");

      const email = `${id}-${address.slice(-8)}@wallet.quark`;
      const result = await authAPI.loginWithWallet(email, providerForApi(id), address);

      if (result.success && result.sessionToken) {
        setSessionToken(result.sessionToken);
        // Read real on-chain balances and merge factory denoms into the protocol view
        try {
          const onChain = await readAllBalances(address);
          const balances: Record<string, number> = {};

          // On-chain Token Factory subdenoms are always lowercase (e.g.
          // "vtestabc"), so a mixed-case app symbol like "VTESTABC" can't be
          // recovered by string-casing tricks (blanket .toUpperCase() used to
          // turn it into "VOSMO"/"VTESTABC" — keys that never matched the
          // app's own "vOSMO"/"vVTESTABC" mint/swap/redeem balance keys,
          // leaving two permanently disconnected sets of numbers). Instead,
          // match each on-chain denom against the app's known base symbols
          // via the same canonical normalizer used when denoms were created,
          // so Keplr's real balance lands under the exact key the rest of
          // the app already uses.
          let knownBaseSymbols: string[] = [];
          try {
            const { contractAPI } = await import("@/lib/api");
            const status = await contractAPI.getStatus();
            if (status?.success) knownBaseSymbols = Object.keys(status.status?.supply ?? {});
          } catch {
            // fall back to unmatched below
          }

          for (const c of onChain) {
            if (c.denom === "uosmo") {
              balances["OSMO"] = Number(c.amount) / 1e6;
              continue;
            }
            if (!isFactoryDenom(c.denom)) continue;
            const onChainSub = c.denom.split("/").pop()!.toLowerCase();
            const matchedBase = knownBaseSymbols.find((sym) => voucherSubdenom(sym) === onChainSub);
            // Fall back to a known real asset's friendly label before the raw
            // sub-denom, so e.g. ".../ulvn" shows as "LVN" rather than "ulvn".
            const key = matchedBase
              ? `v${matchedBase}`
              : (labelForDenom(c.denom) ?? onChainSub);
            balances[key] = Number(c.amount) / 1e6;
            suggestToken(c.denom).catch(() => {});
          }
          const { walletAPI } = await import("@/lib/api");
          // Save balances to backend before marking wallet connected to avoid a
          // race where the store refresh runs before the session contains balances.
          await walletAPI.saveSession(id === "walletconnect" ? "metamask" : id, address, balances).catch(() => {});
        } catch (e) {
          console.warn("Could not read on-chain balances:", e);
        }

        // Now mark the wallet connected (this triggers a refreshAppState which
        // will hydrate tokens using the saved session balances).
        connectWallet(id, address);
        setStage("success");
        toast.success(`Connected via ${wallets.find((w) => w.id === id)?.name}`);
        setTimeout(() => onSuccess?.(), 500);
      } else {
        throw new Error(result.message || "Connection failed");
      }
    } catch (error) {
      toast.error(String(error));
      setStage("select");
      setPending(null);
    }
  };

  const handleDisconnect = () => {
    disconnectWallet();
    toast("Wallet disconnected");
    setStage("select");
    setPending(null);
  };

  const truncate = (a: string) => (a.length > 14 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);
  const activeNet = NETWORKS.find((n) => n.id === network)!;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-md animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-72 -translate-x-1/2 rounded-full bg-primary/30 blur-3xl" />

        <div className="relative flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/20 text-primary-foreground">
              <Shield className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">
                {stage === "success" ? "Wallet connected" : "Connect a wallet"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {stage === "success" ? "Session active on QUARK protocol" : "Cosmos-compatible providers"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        <div className="relative flex items-center justify-between gap-2 border-b border-border bg-background/40 px-5 py-3 text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
            </span>
            <Wifi className="size-3.5" /> Network
          </div>
          <div className="flex items-center gap-2">
            <select
              value={network}
              onChange={(e) => setNetwork(e.target.value)}
              className="rounded-md border border-border bg-card px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {NETWORKS.map((n) => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </select>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-400">
              {activeNet.latency}ms
            </span>
          </div>
        </div>

        <div className="relative p-5">
          {stage === "select" && (
            <div className="space-y-2">
              {wallets.map((w) => (
                <button
                  key={w.id}
                  onClick={() => handlePick(w.id)}
                  disabled={w.id !== "walletconnect" && !w.installed}
                  className="group flex w-full items-center gap-3 rounded-xl border border-border bg-background p-3 text-left transition hover:border-primary/60 hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className={`flex size-10 items-center justify-center rounded-lg bg-gradient-to-br ${w.gradient} text-sm font-bold text-white shadow-lg`}>
                    {w.name[0]}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{w.name}</span>
                      {w.badge && (
                        <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                          {w.badge}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{w.desc}</div>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-emerald-400">Detected</span>
                </button>
              ))}
              <p className="pt-2 text-center text-[11px] text-muted-foreground">
                By connecting you agree to QUARK's <a className="underline hover:text-foreground">Terms</a> &{' '}
                <a className="underline hover:text-foreground">Privacy</a>.
              </p>
            </div>
          )}

          {(stage === "connecting" || stage === "approve") && pending && (
            <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
              <div className="relative flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/30 to-card">
                <Loader2 className="size-8 animate-spin text-primary-foreground" />
                <span className="absolute -bottom-1 right-0 rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-semibold capitalize">
                  {pending}
                </span>
              </div>
              <div>
                <div className="text-sm font-semibold">
                  {stage === "connecting" ? "Requesting connection…" : "Awaiting approval"}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {stage === "connecting"
                    ? `Opening ${pending} extension`
                    : `Confirm the connection in your ${pending} wallet`}
                </p>
              </div>
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="size-1.5 animate-pulse rounded-full bg-primary" style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </div>
            </div>
          )}

          {stage === "success" && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/20">
                  <Check className="size-6 text-emerald-400" />
                </div>
                <div>
                  <div className="text-sm font-semibold capitalize">{user.provider ?? "Wallet"} connected</div>
                  <div className="mt-1 text-xs text-muted-foreground">on {activeNet.name}</div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-background p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Address</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <code className="truncate font-mono text-xs">{truncate(user.address)}</code>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(user.address);
                        toast.success("Address copied");
                      }}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <Copy className="size-3.5" />
                    </button>
                    <a
                      href="#"
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      onClick={(e) => e.preventDefault()}
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={handleDisconnect}>Disconnect</Button>
                <Button onClick={onClose} className="bg-primary text-primary-foreground hover:opacity-90">Continue</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
