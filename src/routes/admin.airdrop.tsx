import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { adminAPI, contractAPI } from "@/lib/api";
import { getTreasuryBalance } from "@/api/cosmos/treasury.functions";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/admin/airdrop")({
  component: AirdropPage,
});

// Minimum native OSMO the treasury needs before a real mint/send will even
// be attempted server-side (see MIN_GAS_BALANCE_OSMO in lib/cosmos/chain.ts)
// — surfaced here too so the admin sees the problem before clicking, not
// after a failed broadcast.
const MIN_GAS_BALANCE_OSMO = 0.5;

function AirdropPage() {
  const [vToken, setVToken] = useState("");
  const [amount, setAmount] = useState(100);
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [supply, setSupply] = useState<any>({});
  const [onchainReserve, setOnchainReserve] = useState<Record<string, number>>({});
  const [onchainStatusError, setOnchainStatusError] = useState<string | null>(null);

  const [reserveToken, setReserveToken] = useState("");
  const [reserveAmount, setReserveAmount] = useState(100);
  const [reserveLoading, setReserveLoading] = useState(false);

  const [sendFrom, setSendFrom] = useState(""); // empty = from contract reserve
  const [sendTo, setSendTo] = useState("");
  const [sendToken, setSendToken] = useState("");
  const [sendAmount, setSendAmount] = useState(100);
  const [sendLoading, setSendLoading] = useState(false);

  const [gas, setGas] = useState<{ configured: boolean; balanceOSMO: number } | null>(null);
  const fetchTreasuryBalance = useServerFn(getTreasuryBalance);

  const refreshStatus = () => {
    contractAPI.getStatus().then(res => {
      const vs = res.status.voucherSupply || {};
      setSupply(vs);
      setOnchainReserve(res.status.onchainReserve || {});
      setOnchainStatusError(res.status.onchainError || null);
      if (Object.keys(vs).length > 0) {
        if (!vToken) setVToken(Object.keys(vs)[0]);
        if (!reserveToken) setReserveToken(Object.keys(vs)[0]);
        if (!sendToken) setSendToken(Object.keys(vs)[0]);
      }
    }).catch(() => {});
  };

  useEffect(() => {
    refreshStatus();
    fetchTreasuryBalance()
      .then(res => setGas({ configured: res.configured, balanceOSMO: res.balanceOSMO }))
      .catch(() => setGas(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gasLow = gas?.configured && gas.balanceOSMO < MIN_GAS_BALANCE_OSMO;

  // Surfaces the real Mintscan link (when a request actually broadcast
  // on-chain) or the on-chain error (when it stayed simulated-only /
  // failed to broadcast), matching the deliverable's promise of a live,
  // clickable confirmation link on every real send.
  const notifyResult = (res: any, successVerb: string) => {
    if (res.onchainTxHash) {
      toast.success(
        <span>
          {successVerb} on-chain.{" "}
          <a href={res.mintscanUrl} target="_blank" rel="noopener noreferrer" className="underline">
            View on Mintscan
          </a>
        </span>,
      );
    } else if (res.onchainError) {
      toast.warning(`Simulated only — ${res.onchainError}`);
    } else {
      toast.success(`${successVerb} (simulated).`);
    }
  };

  // Kept for backwards compatibility: the original reserve-only airdrop.
  const handleAirdrop = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await adminAPI.airdrop(address, vToken, amount);
      if (res.success) {
        toast.success(`Simulated airdrop of ${amount} ${vToken} to ${address} (internal ledger only — not broadcast).`);
        setAddress("");
      } else {
        toast.error(res.message || "Airdrop failed");
      }
    } catch (err) {
      toast.error("An error occurred");
    }
    setLoading(false);
  };

  // Mints into the treasury's real on-chain holdings when the token is a
  // known, already-created Token Factory denom and the treasury has gas;
  // otherwise falls back to the simulated contract reserve (server decides,
  // see handleContractReserve in routes.ts).
  const handleReserve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reserveToken) {
      toast.error("Token is required");
      return;
    }
    setReserveLoading(true);
    try {
      const res = await adminAPI.contractReserve(reserveToken, reserveAmount);
      if (res.success) {
        notifyResult(res, `Reserved ${reserveAmount} ${reserveToken}`);
        refreshStatus();
      } else {
        toast.error(res.message || "Reserve mint failed");
      }
    } catch (err) {
      toast.error("An error occurred");
    }
    setReserveLoading(false);
  };

  // Sends via a real on-chain MsgSend when the source is the reserve and the
  // token is a real voucher with sufficient treasury balance + gas; arbitrary
  // address-to-address sends always stay on the simulated internal ledger.
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendTo || !sendToken) {
      toast.error("Recipient and token are required");
      return;
    }
    setSendLoading(true);
    try {
      const res = await adminAPI.contractSend(sendTo, sendToken, sendAmount, sendFrom || undefined);
      if (res.success) {
        const origin = sendFrom ? sendFrom : "the reserve";
        notifyResult(res, `Sent ${sendAmount} ${sendToken} from ${origin} to ${sendTo}`);
        setSendTo("");
        refreshStatus();
      } else {
        toast.error(res.message || "Send failed");
      }
    } catch (err) {
      toast.error("An error occurred");
    }
    setSendLoading(false);
  };

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Voucher Contract</h1>
        <p className="text-sm text-muted-foreground">
          Reserve mints and reserve-originated sends broadcast for real on Osmosis mainnet when the
          token is an already-created Token Factory denom and the treasury has gas; everything else
          (unrecognized tokens, address-to-address sends) stays on the internal simulated ledger.
        </p>
      </div>

      {onchainStatusError && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-400" />
          <div>
            <div className="font-semibold text-red-400">Could not read on-chain reserve balances</div>
            <div className="text-muted-foreground">
              {onchainStatusError} — the "(on-chain: …)" figures below may be stale or missing. This is
              usually the free public RPC being rate-limited; reserve/send amounts are still checked
              against the real chain at the moment you submit, so this only affects the display.
            </div>
          </div>
        </div>
      )}

      {gas?.configured && gasLow && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-400" />
          <div>
            <div className="font-semibold text-amber-400">Treasury needs funding for gas</div>
            <div className="text-muted-foreground">
              Only {gas.balanceOSMO} OSMO available — real broadcasts need at least {MIN_GAS_BALANCE_OSMO} OSMO.
              Reserve/Send will fall back to simulation-only until the treasury is topped up. See{" "}
              <a href="/admin/treasury" className="inline-flex items-center gap-1 underline">
                Treasury <ExternalLink className="size-3" />
              </a>.
            </div>
          </div>
        </div>
      )}

      {/* Reserve */}
      <form onSubmit={handleReserve} className="space-y-4 rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold">1. Reserve (mint to treasury)</h2>
        <div>
          <label className="mb-1 block text-sm font-medium">Voucher</label>
          <select
            value={reserveToken}
            onChange={e => setReserveToken(e.target.value)}
            required
            className="w-full rounded-md border border-input bg-transparent px-3 py-2"
          >
            {Object.keys(supply).length > 0
              ? Object.keys(supply).map(t => (
                  <option key={t} value={t}>
                    {t}{onchainReserve[t] !== undefined ? ` (on-chain: ${onchainReserve[t]})` : ""}
                  </option>
                ))
              : <option value="">No vouchers available</option>}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Amount</label>
          <input
            type="number"
            value={reserveAmount}
            onChange={e => setReserveAmount(Number(e.target.value))}
            required
            className="w-full rounded-md border border-input bg-transparent px-3 py-2"
          />
        </div>
        <button
          type="submit"
          disabled={reserveLoading}
          className="w-full rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground"
        >
          {reserveLoading ? "Processing..." : "Add to Reserve"}
        </button>
      </form>

      {/* Send */}
      <form onSubmit={handleSend} className="space-y-4 rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold">2. Send</h2>
        <div>
          <label className="mb-1 block text-sm font-medium">Voucher Asset</label>
          <select
            value={sendToken}
            onChange={e => setSendToken(e.target.value)}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2"
          >
            {Object.keys(supply).length > 0
              ? Object.keys(supply).map(t => <option key={t} value={t}>{t}</option>)
              : <option value="">No vouchers available</option>}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">From address (leave empty to send from reserve)</label>
          <input
            type="text"
            value={sendFrom}
            onChange={e => setSendFrom(e.target.value)}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2"
            placeholder="reserve"
          />
          {!sendFrom && (
            <p className="mt-1 text-xs text-muted-foreground">
              Sending from the reserve broadcasts a real on-chain transfer when possible. Any other
              "from" address always stays on the internal simulated ledger — the treasury can only
              ever sign for itself.
            </p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">To address (osmo1…)</label>
          <input
            type="text"
            value={sendTo}
            onChange={e => setSendTo(e.target.value)}
            required
            className="w-full rounded-md border border-input bg-transparent px-3 py-2"
            placeholder="osmo1..."
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Amount</label>
          <input
            type="number"
            value={sendAmount}
            onChange={e => setSendAmount(Number(e.target.value))}
            required
            className="w-full rounded-md border border-input bg-transparent px-3 py-2"
          />
        </div>
        <button
          type="submit"
          disabled={sendLoading}
          className="w-full rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground"
        >
          {sendLoading ? "Processing..." : "Send"}
        </button>
      </form>

      {/* Legacy reserve-only airdrop — internal ledger only, never broadcasts.
          Kept for backwards compatibility; use Reserve + Send above for a
          real on-chain airdrop. */}
      <details className="rounded-xl border border-border bg-card p-6">
        <summary className="cursor-pointer font-semibold">Legacy: simulated-only airdrop (does not broadcast)</summary>
        <form onSubmit={handleAirdrop} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Voucher Asset</label>
            <select value={vToken} onChange={e => setVToken(e.target.value)} className="w-full rounded-md border border-input bg-transparent px-3 py-2">
              {Object.keys(supply).length > 0
                ? Object.keys(supply).map(t => <option key={t} value={t}>{t}</option>)
                : <option value="">No vouchers available</option>}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Recipient Address</label>
            <input type="text" value={address} onChange={e => setAddress(e.target.value)} required className="w-full rounded-md border border-input bg-transparent px-3 py-2" placeholder="0x..." />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Amount</label>
            <input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} required className="w-full rounded-md border border-input bg-transparent px-3 py-2" />
          </div>
          <button type="submit" disabled={loading} className="w-full rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground">
            {loading ? "Processing..." : "Send Airdrop (legacy)"}
          </button>
        </form>
      </details>
    </div>
  );
}
