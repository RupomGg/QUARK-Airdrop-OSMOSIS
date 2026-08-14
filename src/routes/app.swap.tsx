import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useStore, fmt, type TokenSymbol } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowDown, Ticket, Coins, Loader2, CircleCheck, ExternalLink } from "lucide-react";
import { StatusBadge } from "@/routes/app.vouchers";
import { timeAgo } from "@/routes/app.index";
import { swapAPI, voucherAPI, isRealCosmosTxHash, mintscanTxUrl } from "@/lib/api";
import { getRealDenom, toMicroUnits, KNOWN_REAL_DENOMS } from "@/lib/cosmos/realDenoms";
import { sendViaKeplr } from "@/lib/cosmos/keplr";
import { voucherSubdenom, buildFactoryDenom } from "@/lib/cosmos/denom";

const TREASURY_ADDRESS = (import.meta as any).env?.VITE_TREASURY_ADDRESS || "";

export const Route = createFileRoute("/app/swap")({
  component: SwapPage,
});

type Mode = "t2v" | "v2t" | "v2v";

function SwapPage() {
  const { user, tokens, vouchers, transactions, refreshAppState } = useStore();
  const symbols = Object.keys(tokens) as TokenSymbol[];
  const [mode, setMode] = useState<Mode>("v2v");
  const [from, setFrom] = useState<TokenSymbol>("");
  const [to, setTo] = useState<TokenSymbol>("");

  useEffect(() => {
    if (!from && symbols.length > 0) setFrom(symbols[0]);
    if (!to && symbols.length > 1) setTo(symbols[1]);
  }, [symbols, from, to]);
  const [amount, setAmount] = useState("100");
  const [voucherId, setVoucherId] = useState<string>("");
  // Redeeming a real voucher held in the wallet without a matching DBVoucher
  // record (e.g. received via a direct admin airdrop) — only symbols with a
  // real backing asset can go through this path.
  const realVoucherSymbols = Object.keys(KNOWN_REAL_DENOMS).map((base) => `v${base}`);
  const [walletRedeemToken, setWalletRedeemToken] = useState<string>("");
  const [confirm, setConfirm] = useState(false);
  const [signing, setSigning] = useState<null | "signing" | "broadcasting" | "confirmed">(null);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [lastMintscanUrl, setLastMintscanUrl] = useState<string | null>(null);

  const selectedVoucher = vouchers.find((v) => v.id === voucherId);
  const sourceToken = mode === "v2v" ? (selectedVoucher?.token ?? from) : from;
  const rate = useMemo(
    () => tokens[sourceToken]?.price / tokens[to]?.price || 1,
    [sourceToken, to, tokens],
  );
  const out =
    mode === "v2v"
      ? selectedVoucher
        ? selectedVoucher.amount * rate
        : 0
      : (Number(amount) || 0) * rate;

  const activeVouchers = vouchers.filter((v) => v.status === "active");
  // No DBVoucher to pick from — fall back to redeeming straight off the
  // connected wallet's real on-chain balance instead.
  const useWalletRedeem = mode === "v2t" && activeVouchers.length === 0;

  useEffect(() => {
    if (useWalletRedeem && !walletRedeemToken && realVoucherSymbols.length > 0) {
      setWalletRedeemToken(realVoucherSymbols[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useWalletRedeem]);
  const swapHistory = transactions
    .filter((t) => t.type === "swap" || t.type === "voucher" || t.type === "redeem")
    .slice(0, 10);

  const startSigning = (onDone: () => Promise<{ ok: boolean; txHash?: string | null }>) => {
    setSigning("broadcasting");
    setLastTxHash(null);
    setLastMintscanUrl(null);
    Promise.resolve(onDone())
      .then((res) => {
        if (!res?.ok) {
          // Error toast already shown — return to the confirm dialog
          setSigning(null);
          return;
        }
        setSigning("confirmed");
        // With a real on-chain tx, keep the dialog open so the Mintscan
        // link stays clickable; otherwise close after a short beat.
        if (!res.txHash) {
          window.setTimeout(() => {
            setSigning(null);
            setConfirm(false);
          }, 2000);
        }
      })
      .catch(() => setSigning(null));
  };

  const doSwap = async () => {
    if (mode === "t2v") {
      const a = Number(amount);
      if (!a || a <= 0) return toast.error("Invalid amount");
      if (a > tokens[from].userBalance) return toast.error("Insufficient balance");

      const real = getRealDenom(from);
      const canGoOnchain = real && user.connected && user.address && TREASURY_ADDRESS;

      startSigning(async () => {
        try {
          if (canGoOnchain) {
            // Real flow: user signs a real transfer of the underlying token
            // to the treasury via Keplr FIRST, then the server verifies it
            // on-chain and mints the voucher directly into the user's wallet.
            const microAmount = toMicroUnits(a, real!.exponent);
            let escrowTxHash: string;
            try {
              const escrow = await sendViaKeplr(
                user.address,
                TREASURY_ADDRESS,
                [{ denom: real!.denom, amount: microAmount }],
                `QUARK mint escrow ${from}`,
              );
              escrowTxHash = escrow.txHash;
            } catch (err) {
              toast.error(`Wallet transfer failed: ${err instanceof Error ? err.message : String(err)}`);
              return { ok: false };
            }
            const result = await voucherAPI.mintOnchain(from, a, escrowTxHash);
            if (result.success && result.voucher) {
              await refreshAppState();
              setLastTxHash(result.mintTxHash);
              setLastMintscanUrl(result.mintscanUrl || mintscanTxUrl(result.mintTxHash));
              toast.success(`Voucher minted on-chain: ${result.voucher.code}`);
              return { ok: true, txHash: result.mintTxHash };
            }
            toast.error(result.message || "On-chain voucher mint failed");
            return { ok: false };
          }

          const result = await voucherAPI.create(from, a);
          if (result.success && result.voucher) {
            await refreshAppState();
            toast.success(`Voucher minted: ${result.voucher.code}`);
            return { ok: true };
          }
          toast.error(result.message || "Voucher mint failed");
          return { ok: false };
        } catch (error) {
          toast.error(String(error));
          return { ok: false };
        }
      });
    } else if (mode === "v2t" && useWalletRedeem) {
      const qty = Number(amount);
      if (!qty || qty <= 0) return toast.error("Invalid amount");
      const real = getRealDenom(walletRedeemToken);
      if (!real) return toast.error(`${walletRedeemToken} has no real backing asset configured.`);
      if (!TREASURY_ADDRESS) {
        toast.error("Treasury address is not configured (VITE_TREASURY_ADDRESS).");
        return;
      }
      if (!user.connected || !user.address) {
        toast.error(
          `Connect your Keplr wallet first — redeeming ${walletRedeemToken} pays out real ${real.label}.`,
        );
        return;
      }
      startSigning(async () => {
        try {
          // Same mechanics as the DBVoucher redeem below (send the real
          // voucher tokens back to the treasury, server verifies + burns +
          // pays out the real backing asset) — just without a voucherId,
          // since these tokens never passed through the app's own DB.
          const voucherDenom = buildFactoryDenom(TREASURY_ADDRESS, voucherSubdenom(walletRedeemToken));
          const microAmount = toMicroUnits(qty, real.exponent);
          let returnTxHash: string;
          try {
            const ret = await sendViaKeplr(
              user.address,
              TREASURY_ADDRESS,
              [{ denom: voucherDenom, amount: microAmount }],
              `QUARK wallet redeem ${walletRedeemToken}`,
            );
            returnTxHash = ret.txHash;
          } catch (err) {
            toast.error(`Wallet transfer failed: ${err instanceof Error ? err.message : String(err)}`);
            return { ok: false };
          }
          const result = await voucherAPI.redeemWalletOnchain(walletRedeemToken, qty, returnTxHash);
          if (result.success) {
            await refreshAppState();
            setLastTxHash(result.sendTxHash);
            setLastMintscanUrl(result.mintscanUrl || mintscanTxUrl(result.sendTxHash));
            toast.success("Redeemed on-chain");
            return { ok: true, txHash: result.sendTxHash };
          }
          toast.error(result.message || "On-chain redemption failed");
          return { ok: false };
        } catch (error) {
          toast.error(String(error));
          return { ok: false };
        }
      });
    } else if (mode === "v2t") {
      if (!voucherId) return toast.error("Select a voucher");
      startSigning(async () => {
        try {
          const v = vouchers.find((x) => x.id === voucherId);
          if (!v) {
            toast.error("Voucher not found");
            return { ok: false };
          }

          const real = getRealDenom(v.token);
          if (real) {
            // This voucher is backed by a real asset, so it MUST redeem
            // on-chain: send the real voucher tokens back to the treasury,
            // which verifies the transfer, burns them, and pays out the real
            // underlying asset. Both sides move, so the balance decreases.
            //
            // Critically, do NOT fall through to the simulated redeem when a
            // precondition is missing. Doing so was the bug: redemption
            // silently produced a SIM transaction — no Keplr prompt, no
            // balance change, no error — leaving no way to tell why.
            if (!TREASURY_ADDRESS) {
              toast.error("Treasury address is not configured (VITE_TREASURY_ADDRESS).");
              return { ok: false };
            }
            if (!user.connected || !user.address) {
              toast.error(
                `Connect your Keplr wallet first — redeeming ${v.token} pays out real ${real.label}.`,
              );
              return { ok: false };
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
              toast.error(`Wallet transfer failed: ${err instanceof Error ? err.message : String(err)}`);
              return { ok: false };
            }
            const result = await voucherAPI.redeemOnchain(voucherId, returnTxHash);
            if (result.success) {
              await refreshAppState();
              setLastTxHash(result.sendTxHash);
              setLastMintscanUrl(result.mintscanUrl || mintscanTxUrl(result.sendTxHash));
              toast.success("Voucher redeemed on-chain");
              return { ok: true, txHash: result.sendTxHash };
            }
            toast.error(result.message || "On-chain redemption failed");
            return { ok: false };
          }

          const result = await voucherAPI.redeem(voucherId);
          if (result.success) {
            await refreshAppState();
            toast.success("Voucher redeemed to tokens");
            return { ok: true };
          }
          toast.error(result.message || "Redemption failed");
          return { ok: false };
        } catch (error) {
          toast.error(String(error));
          return { ok: false };
        }
      });
    } else if (mode === "v2v") {
      if (!voucherId) return toast.error("Select a voucher");
      const v = vouchers.find((x) => x.id === voucherId);
      if (!v) return toast.error("Voucher not found");
      if (v.token === to) return toast.error("Select a different target token");
      startSigning(async () => {
        try {
          if (v.onchainMintTx && user.connected && user.address && TREASURY_ADDRESS) {
            // Real flow: this voucher was delivered on-chain, so it holds
            // real tokens in the user's Keplr wallet. Send them to the
            // treasury first, then the server verifies, swaps on the real
            // DEX, and sends the real result back.
            const sourceDenom = buildFactoryDenom(TREASURY_ADDRESS, voucherSubdenom(v.token));
            const microAmount = toMicroUnits(v.amount, 6);
            let escrowTxHash: string;
            try {
              const escrow = await sendViaKeplr(
                user.address,
                TREASURY_ADDRESS,
                [{ denom: sourceDenom, amount: microAmount }],
                `QUARK swap escrow v${v.token} -> v${to}`,
              );
              escrowTxHash = escrow.txHash;
            } catch (err) {
              toast.error(`Wallet transfer failed: ${err instanceof Error ? err.message : String(err)}`);
              return { ok: false };
            }
            const result = await swapAPI.swapVoucherOnchain(voucherId, to, escrowTxHash);
            if (result.success) {
              setLastTxHash(result.sendTxHash);
              setLastMintscanUrl(result.mintscanUrl || mintscanTxUrl(result.sendTxHash));
              await refreshAppState();
              toast.success(`Swapped voucher ${v.token} → ${to} on-chain`, {
                description: `On-chain: ${result.sendTxHash.slice(0, 12)}…`,
              });
              return { ok: true, txHash: result.sendTxHash };
            }
            toast.error(result.message || "On-chain swap failed");
            return { ok: false };
          }

          // Single atomic server call: swap + redeem old voucher + issue new one
          const result = await swapAPI.swapVoucher(voucherId, to);
          if (result.success) {
            if (result.onchainTxHash) {
              setLastTxHash(result.onchainTxHash);
              setLastMintscanUrl(result.explorerUrl || mintscanTxUrl(result.onchainTxHash));
            }
            await refreshAppState();
            toast.success(`Swapped voucher ${v.token} → ${to}`, {
              description: result.onchainTxHash
                ? `On-chain: ${result.onchainTxHash.slice(0, 12)}…`
                : "Simulation mode",
            });
            return { ok: true, txHash: result.onchainTxHash ?? null };
          }
          toast.error(result.message || "Swap failed");
          return { ok: false };
        } catch (error) {
          toast.error(String(error));
          return { ok: false };
        }
      });
    }
  };

  const openConfirm = () => {
    if ((mode === "v2t" || mode === "v2v") && !voucherId && activeVouchers[0])
      setVoucherId(activeVouchers[0].id);
    if (useWalletRedeem && !amount) {
      toast.error("Enter an amount");
      return;
    }
    setConfirm(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Swap & Redeem</h1>
        <p className="text-sm text-muted-foreground">
          Trade vouchers, mint vouchers, or redeem vouchers back into the original token —
          liquidity-safe.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-6 lg:col-span-1">
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-background p-1 text-xs">
            <button
              onClick={() => setMode("v2v")}
              className={`rounded-md py-2 font-medium transition ${mode === "v2v" ? "bg-primary/20 text-foreground" : "text-muted-foreground"}`}
            >
              Voucher ↔ Voucher
            </button>
            <button
              onClick={() => setMode("t2v")}
              className={`rounded-md py-2 font-medium transition ${mode === "t2v" ? "bg-primary/20 text-foreground" : "text-muted-foreground"}`}
            >
              Token → Voucher
            </button>
            <button
              onClick={() => setMode("v2t")}
              className={`rounded-md py-2 font-medium transition ${mode === "v2t" ? "bg-primary/20 text-foreground" : "text-muted-foreground"}`}
            >
              Voucher → Token
            </button>
          </div>

          {mode === "t2v" ? (
            <div className="mt-4 space-y-2">
              <div className="rounded-xl border border-border bg-background p-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>From</span>
                  <span>Balance: {fmt(tokens[from]?.userBalance || 0)}</span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <Input
                    className="flex-1 border-0 bg-transparent !text-2xl font-bold focus-visible:ring-0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  <Select value={from} onValueChange={(v) => setFrom(v as TokenSymbol)}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {symbols.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-center">
                <button className="rounded-full border border-border bg-card p-2 hover:bg-accent cursor-default">
                  <ArrowDown className="size-4" />
                </button>
              </div>

              <div className="rounded-xl border border-border bg-background p-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>To (estimate)</span>
                  <span className="flex items-center gap-1">
                    <Ticket className="size-3" /> Voucher
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex-1 text-2xl font-bold">{fmt(Number(amount) || 0)}</div>
                  <div className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-bold">
                    {from} VOUCHER
                  </div>
                </div>
              </div>
              <div className="text-center text-[11px] text-muted-foreground">
                {getRealDenom(from) && user.connected ? (
                  <span className="text-emerald-400">
                    ⚡ Real on-chain escrow — Keplr will prompt you to send{" "}
                    <strong>{getRealDenom(from)!.label}</strong> to mint this voucher
                  </span>
                ) : (
                  <span>Simulated mint — connect a Keplr wallet with {from} for real on-chain escrow</span>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-border bg-background p-4">
                <div className="text-xs text-muted-foreground">Active vouchers</div>
                {activeVouchers.length === 0 ? (
                  mode === "v2t" ? (
                    <div className="mt-2 space-y-3">
                      <div className="text-sm text-muted-foreground">
                        No vouchers minted through this app — but if you hold real voucher tokens in
                        your wallet from elsewhere (e.g. an admin airdrop), redeem them directly:
                      </div>
                      <div className="flex items-center gap-2">
                        <Select value={walletRedeemToken} onValueChange={setWalletRedeemToken}>
                          <SelectTrigger className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {realVoucherSymbols.map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          className="flex-1"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder="Amount"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 text-sm text-muted-foreground">
                      No active vouchers. Create one from Token → Voucher.
                    </div>
                  )
                ) : (
                  <div className="mt-2 space-y-2">
                    {activeVouchers.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => setVoucherId(v.id)}
                        className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition ${voucherId === v.id ? "border-primary/60 bg-primary/10" : "border-border hover:border-primary/40"}`}
                      >
                        <div>
                          <div className="font-mono text-xs">
                            {v.code}
                            {v.onchainMintTx && <span className="ml-1.5 text-emerald-400">⚡</span>}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {new Date(v.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold">
                            {fmt(v.amount)} {v.token}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {mode === "v2t" && selectedVoucher && (
                <div className="rounded-lg border border-border bg-background p-3 text-[11px]">
                  {(() => {
                    const real = getRealDenom(selectedVoucher.token);
                    if (!real)
                      return (
                        <span className="text-muted-foreground">
                          Simulated redemption — {selectedVoucher.token} has no real backing asset
                          configured.
                        </span>
                      );
                    if (!TREASURY_ADDRESS)
                      return (
                        <span className="text-amber-400">
                          Simulated — VITE_TREASURY_ADDRESS is not set.
                        </span>
                      );
                    if (!user.connected || !user.address)
                      return (
                        <span className="text-amber-400">
                          ⚠️ Simulated — no wallet connected. Connect Keplr to redeem for real{" "}
                          {real.label}.
                        </span>
                      );
                    return (
                      <span className="text-emerald-400">
                        ⚡ Real redemption — Keplr will ask you to send {selectedVoucher.token}{" "}
                        back, then you receive <strong>{real.label}</strong>.
                      </span>
                    );
                  })()}
                </div>
              )}
              {useWalletRedeem && walletRedeemToken && (
                <div className="rounded-lg border border-border bg-background p-3 text-[11px]">
                  {(() => {
                    const real = getRealDenom(walletRedeemToken);
                    if (!real)
                      return (
                        <span className="text-muted-foreground">
                          {walletRedeemToken} has no real backing asset configured.
                        </span>
                      );
                    if (!TREASURY_ADDRESS)
                      return (
                        <span className="text-amber-400">
                          Treasury address is not configured (VITE_TREASURY_ADDRESS).
                        </span>
                      );
                    if (!user.connected || !user.address)
                      return (
                        <span className="text-amber-400">
                          ⚠️ Connect Keplr first — redeeming {walletRedeemToken} pays out real{" "}
                          {real.label}.
                        </span>
                      );
                    return (
                      <span className="text-emerald-400">
                        ⚡ Keplr will ask you to send {walletRedeemToken} to the treasury, then you
                        receive real <strong>{real.label}</strong> back.
                      </span>
                    );
                  })()}
                </div>
              )}
              {mode === "v2v" && (
                <div className="rounded-xl border border-border bg-background p-4">
                  <div className="text-xs text-muted-foreground">Target voucher token</div>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="flex-1 text-2xl font-bold">{fmt(out)}</div>
                    <Select value={to} onValueChange={(v) => setTo(v as TokenSymbol)}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {symbols.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 space-y-1 text-xs text-muted-foreground">
            {mode === "t2v" ? (
              <>
                <div className="flex justify-between">
                  <span>Voucher backing</span>
                  <span>1:1 fully collateralized</span>
                </div>
                <div className="flex justify-between">
                  <span>Liquidity impact</span>
                  <span className="text-emerald-400">None (escrowed)</span>
                </div>
                <div className="flex justify-between">
                  <span>Protocol Fee</span>
                  <span>0.00%</span>
                </div>
              </>
            ) : mode === "v2v" ? (
              <>
                <div className="flex justify-between">
                  <span>Conversion path</span>
                  <span>
                    {selectedVoucher ? `v${selectedVoucher.token} → v${to}` : "Select voucher"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Rate estimate</span>
                  <span>
                    1 {selectedVoucher?.token || "token"} ≈ {fmt(rate, 6)} {to}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Settlement</span>
                  <span>Voucher Swap LP</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between">
                  <span>Redemption rate</span>
                  <span>1:1 to original token</span>
                </div>
                <div className="flex justify-between">
                  <span>Liquidity impact</span>
                  <span className="text-emerald-400">None (escrow release)</span>
                </div>
                <div className="flex justify-between">
                  <span>Settlement</span>
                  <span>Instant</span>
                </div>
              </>
            )}
          </div>

          <Button
            onClick={openConfirm}
            className="mt-4 w-full bg-primary text-primary-foreground hover:opacity-90"
          >
            Review {mode === "t2v" ? "Mint" : mode === "v2v" ? "Swap" : "Redemption"}
          </Button>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 lg:col-span-2">
          <h2 className="mb-4 font-semibold">Recent Activity</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2">Type</th>
                <th>Asset</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Hash</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {swapHistory.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    No activity yet.
                  </td>
                </tr>
              )}
              {swapHistory.map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="py-3 font-mono text-xs capitalize">{t.type}</td>
                  <td className="font-mono">
                    {t.from && t.to && t.type === "swap" ? `${t.from}→${t.to}` : t.token}
                  </td>
                  <td>{fmt(t.amount)}</td>
                  <td>
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="font-mono text-muted-foreground">{t.hash}</td>
                  <td className="text-muted-foreground">{timeAgo(t.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {confirm && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-background/80 p-4 backdrop-blur"
          onClick={() => !signing && setConfirm(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-card p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {!signing ? (
              <>
                <h3 className="font-semibold">
                  Confirm {mode === "t2v" ? "voucher mint" : mode === "v2v" ? "swap" : "redemption"}
                </h3>
                <div className="mt-4 space-y-2 rounded-lg border border-border bg-background p-4 text-sm">
                  {mode === "v2v" && selectedVoucher && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">You pay</span>
                        <span className="font-semibold">
                          {fmt(selectedVoucher.amount)} v{selectedVoucher.token}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">You receive</span>
                        <span className="font-semibold">
                          {fmt(out)} v{to}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Rate</span>
                        <span>
                          1 v{selectedVoucher.token} ≈ {fmt(rate, 6)} v{to}
                        </span>
                      </div>
                    </>
                  )}
                  {mode === "t2v" && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Escrow</span>
                        <span className="font-semibold">
                          {fmt(Number(amount))} {from}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Voucher value</span>
                        <span className="font-semibold">
                          {fmt(Number(amount))} {from}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Backing</span>
                        <span>1:1 collateralized</span>
                      </div>
                    </>
                  )}
                  {mode === "v2t" && voucherId && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Voucher</span>
                        <span className="font-mono">
                          {vouchers.find((v) => v.id === voucherId)?.code}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">You receive</span>
                        <span className="font-semibold">
                          {fmt(vouchers.find((v) => v.id === voucherId)?.amount || 0)}{" "}
                          {vouchers.find((v) => v.id === voucherId)?.token}
                        </span>
                      </div>
                    </>
                  )}
                  {useWalletRedeem && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Redeeming</span>
                        <span className="font-semibold">
                          {fmt(Number(amount) || 0)} {walletRedeemToken}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">You receive</span>
                        <span className="font-semibold">
                          {getRealDenom(walletRedeemToken)?.label ?? "—"}
                        </span>
                      </div>
                    </>
                  )}
                </div>
                <div className="mt-4 flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setConfirm(false)}>
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 bg-primary text-primary-foreground hover:opacity-90"
                    onClick={doSwap}
                  >
                    Sign with Wallet
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-4 py-4 text-center">
                {signing === "confirmed" ? (
                  <CircleCheck className="mx-auto size-12 text-emerald-400" />
                ) : (
                  <Loader2 className="mx-auto size-12 animate-spin text-primary" />
                )}
                <div>
                  <div className="font-semibold">
                    {signing === "signing" && "Waiting for wallet signature…"}
                    {signing === "broadcasting" && "Broadcasting to Cosmos network…"}
                    {signing === "confirmed" && "Transaction confirmed"}
                  </div>
                  <div className="mt-1 font-mono text-xs text-muted-foreground">
                    {signing === "signing" && "Approve in your wallet"}
                    {signing === "broadcasting" && "Awaiting block inclusion"}
                    {signing === "confirmed" && "Settled on Osmosis"}
                  </div>
                  {signing === "confirmed" && lastTxHash && isRealCosmosTxHash(lastTxHash) && (
                    <a
                      href={lastMintscanUrl ?? mintscanTxUrl(lastTxHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/20"
                    >
                      View on Mintscan <ExternalLink className="size-3" />
                    </a>
                  )}
                  {signing === "confirmed" &&
                    (!lastTxHash || !isRealCosmosTxHash(lastTxHash ?? "")) && (
                      <span className="mt-2 inline-block rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground">
                        Simulation mode — connect treasury wallet for on-chain proof
                      </span>
                    )}
                  {signing === "confirmed" && lastTxHash && (
                    <Button
                      variant="outline"
                      className="mt-4 w-full"
                      onClick={() => {
                        setSigning(null);
                        setConfirm(false);
                      }}
                    >
                      Close
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
