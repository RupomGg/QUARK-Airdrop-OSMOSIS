// SERVER-ONLY. Token Factory operations executed by the protocol treasury.
import { getProtocolSigner } from "./signer.server";
import {
  msgCreateDenom,
  msgMint,
  msgBurn,
  msgSetDenomMetadata,
  msgChangeAdmin,
  type DenomMetadata,
} from "@/lib/cosmos/messages";
import { buildFactoryDenom } from "@/lib/cosmos/denom";

export interface CreateDenomResult {
  denom: string;
  txHash: string;
  height: number;
  gasUsed: string;
}

export async function createDenom(subdenom: string, metadata?: Partial<DenomMetadata>): Promise<CreateDenomResult> {
  const signer = await getProtocolSigner();
  const denom = buildFactoryDenom(signer.address, subdenom);

  const msgs: any[] = [msgCreateDenom(signer.address, subdenom)];
  if (metadata) {
    const md: DenomMetadata = {
      description: metadata.description || `${subdenom} voucher`,
      denomUnits: metadata.denomUnits || [
        { denom, exponent: 0, aliases: [] },
        { denom: subdenom.toUpperCase(), exponent: 6, aliases: [] },
      ],
      base: denom,
      display: metadata.display || subdenom.toUpperCase(),
      name: metadata.name || subdenom,
      symbol: metadata.symbol || subdenom.toUpperCase(),
    };
    msgs.push(msgSetDenomMetadata(signer.address, md));
  }

  const res = await signer.client.signAndBroadcast(signer.address, msgs, "auto", `QUARK create ${subdenom}`);
  if (res.code !== 0) throw new Error(`createDenom failed: ${res.rawLog}`);

  return { denom, txHash: res.transactionHash, height: res.height, gasUsed: String(res.gasUsed) };
}

export async function mintToAddress(denom: string, amount: string, recipient: string) {
  const signer = await getProtocolSigner();
  const res = await signer.client.signAndBroadcast(
    signer.address,
    [msgMint(signer.address, { denom, amount }, recipient)],
    "auto",
    `QUARK mint ${denom}`,
  );
  if (res.code !== 0) throw new Error(`mint failed: ${res.rawLog}`);
  return { txHash: res.transactionHash, height: res.height };
}

export async function burnFromTreasury(denom: string, amount: string) {
  const signer = await getProtocolSigner();
  const res = await signer.client.signAndBroadcast(
    signer.address,
    [msgBurn(signer.address, { denom, amount })],
    "auto",
    `QUARK burn ${denom}`,
  );
  if (res.code !== 0) throw new Error(`burn failed: ${res.rawLog}`);
  return { txHash: res.transactionHash, height: res.height };
}

export async function changeDenomAdmin(denom: string, newAdmin: string) {
  const signer = await getProtocolSigner();
  const res = await signer.client.signAndBroadcast(
    signer.address,
    [msgChangeAdmin(signer.address, denom, newAdmin)],
    "auto",
    `QUARK change admin ${denom}`,
  );
  if (res.code !== 0) throw new Error(`changeAdmin failed: ${res.rawLog}`);
  return { txHash: res.transactionHash, height: res.height };
}
