// SERVER-ONLY. Verifies a client-supplied tx hash actually did what it
// claims, by querying the LCD directly. Never trust a tx hash from the
// client without this check — an attacker could otherwise submit an
// unrelated (or entirely made-up) hash to claim a mint/redeem for free.
import { DEFAULT_LCD } from "@/lib/cosmos/chain";
import { claim, release } from "../locks";

export interface ExpectedSend {
  txHash: string;
  fromAddress: string;
  toAddress: string;
  denom: string;
  minAmount: string; // in the denom's base (micro) units
}

// Without a recency bound, anyone who has EVER sent the treasury a qualifying
// amount for any unrelated reason (a donation, a stray payment from another
// dApp, an old denom-creation fee) could cite that old tx hash here and mint
// a voucher for free — verifyBankSend only checks that a matching transfer
// exists, not that it was made for THIS request. A tight window closes that
// off while still comfortably covering "user signs, then clicks mint."
const MAX_TX_AGE_MS = 30 * 60 * 1000;

export class TxVerificationError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "TxVerificationError";
  }
}

/**
 * Confirms `txHash` is a successful, already-final transaction containing a
 * MsgSend of at least `minAmount` of `denom` from `fromAddress` to
 * `toAddress`. Throws TxVerificationError with a specific reason on any
 * mismatch.
 */
export async function verifyBankSend(expected: ExpectedSend): Promise<{ height: number }> {
  const { txHash, fromAddress, toAddress, denom, minAmount } = expected;
  if (!/^[0-9A-Fa-f]{64}$/.test(txHash)) {
    throw new TxVerificationError("Not a valid transaction hash.");
  }

  const res = await fetch(`${DEFAULT_LCD}/cosmos/tx/v1beta1/txs/${txHash}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new TxVerificationError(
      res.status === 404
        ? "Transaction not found on-chain yet — wait for confirmation and try again."
        : `Could not look up transaction (HTTP ${res.status}).`,
    );
  }
  const data = await res.json();
  const txResponse = data?.tx_response;
  const messages: any[] = data?.tx?.body?.messages ?? [];
  if (!txResponse) throw new TxVerificationError("Transaction not found on-chain.");
  if (txResponse.code !== 0) {
    throw new TxVerificationError(`Transaction failed on-chain (code ${txResponse.code}).`);
  }

  const txTimeMs = Date.parse(txResponse.timestamp);
  if (!Number.isFinite(txTimeMs) || Date.now() - txTimeMs > MAX_TX_AGE_MS) {
    throw new TxVerificationError(
      "This transaction is too old to use here — send a new transfer and try again.",
    );
  }

  const match = messages.some((m) => {
    if (m["@type"] !== "/cosmos.bank.v1beta1.MsgSend") return false;
    if (m.from_address !== fromAddress) return false;
    if (m.to_address !== toAddress) return false;
    const coin = (m.amount ?? []).find((c: any) => c.denom === denom);
    if (!coin) return false;
    return BigInt(coin.amount) >= BigInt(minAmount);
  });

  if (!match) {
    throw new TxVerificationError(
      `Transaction does not contain a matching transfer of ${minAmount}${denom} from ${fromAddress} to ${toAddress}.`,
    );
  }

  return { height: Number(txResponse.height) };
}

/**
 * Reserves a tx hash so it can't be used twice — e.g. two concurrent mint
 * requests both citing the same real escrow transaction. MUST be called
 * before any `await` in the caller (right after extracting the hash from the
 * request), otherwise two requests can both pass a separate has-it-been-used
 * check before either records it. Returns false if already reserved.
 *
 * Call `releaseTxReservation` only when verification subsequently fails (so a
 * legitimate retry — e.g. the LCD hadn't indexed the tx yet — isn't
 * permanently blocked). Do NOT release after a successful mint/redeem; the
 * reservation is what prevents the same real transaction from paying out
 * twice, since there is no separate DB column tracking "this tx was spent."
 */
export function reserveTxHash(txHash: string): boolean {
  return claim(`tx:${txHash.toUpperCase()}`);
}
export function releaseTxReservation(txHash: string): void {
  release(`tx:${txHash.toUpperCase()}`);
}
