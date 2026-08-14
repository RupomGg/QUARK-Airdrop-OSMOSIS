import { BinaryWriter, BinaryReader } from "cosmjs-types/binary";
import { Registry, type GeneratedType } from "@cosmjs/proto-signing";
import { defaultRegistryTypes } from "@cosmjs/stargate";


// Convert a decimal string (e.g. "0.003") to a 18-decimal big integer string (e.g. "3000000000000000")
function toDecString(val: string): string {
  if (!val || val === "0") return "0";
  const parts = val.split(".");
  const integerPart = parts[0] || "";
  let fractionPart = parts[1] || "";
  // Pad fraction to 18 places
  fractionPart = fractionPart.padEnd(18, "0").slice(0, 18);
  // Combine and remove leading zeros
  const combined = `${integerPart}${fractionPart}`.replace(/^0+/, "");
  return combined || "0";
}

// MsgCreateDenom defines the MsgCreateDenom type
export const MsgCreateDenomType: GeneratedType = {
  encode(message: any, writer = BinaryWriter.create()): BinaryWriter {
    if (message.sender !== "") {
      writer.tag(1, 2).string(message.sender);
    }
    if (message.subdenom !== "") {
      writer.tag(2, 2).string(message.subdenom);
    }
    return writer;
  },

  decode(input: Uint8Array | BinaryReader, length?: number): any {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const end = length === undefined ? reader.len : reader.pos + length;
    const message = { sender: "", subdenom: "" };
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.sender = reader.string();
          break;
        case 2:
          message.subdenom = reader.string();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromPartial(object: any): any {
    return {
      sender: object.sender ?? "",
      subdenom: object.subdenom ?? "",
    };
  },
};

// MsgMint defines the MsgMint type
export const MsgMintType: GeneratedType = {
  encode(message: any, writer = BinaryWriter.create()): BinaryWriter {
    if (message.sender !== "") {
      writer.tag(1, 2).string(message.sender);
    }
    if (message.amount !== undefined) {
      writer.tag(2, 2).fork();
      writer.tag(1, 2).string(message.amount.denom);
      writer.tag(2, 2).string(message.amount.amount);
      writer.ldelim();
    }
    if (message.mintToAddress !== "") {
      writer.tag(3, 2).string(message.mintToAddress);
    }
    return writer;
  },

  decode(input: Uint8Array | BinaryReader, length?: number): any {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const end = length === undefined ? reader.len : reader.pos + length;
    const message: any = { sender: "", amount: undefined, mintToAddress: "" };
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.sender = reader.string();
          break;
        case 2:
          message.amount = { denom: "", amount: "" };
          const limit = reader.uint32();
          const baseEnd = reader.pos + limit;
          while (reader.pos < baseEnd) {
            const tagCoin = reader.uint32();
            switch (tagCoin >>> 3) {
              case 1:
                message.amount.denom = reader.string();
                break;
              case 2:
                message.amount.amount = reader.string();
                break;
              default:
                reader.skipType(tagCoin & 7);
                break;
            }
          }
          break;
        case 3:
          message.mintToAddress = reader.string();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromPartial(object: any): any {
    return {
      sender: object.sender ?? "",
      amount: object.amount ? { denom: object.amount.denom ?? "", amount: object.amount.amount ?? "" } : undefined,
      mintToAddress: object.mintToAddress ?? "",
    };
  },
};

// MsgBurn defines the MsgBurn type
export const MsgBurnType: GeneratedType = {
  encode(message: any, writer = BinaryWriter.create()): BinaryWriter {
    if (message.sender !== "") {
      writer.tag(1, 2).string(message.sender);
    }
    if (message.amount !== undefined) {
      writer.tag(2, 2).fork();
      writer.tag(1, 2).string(message.amount.denom);
      writer.tag(2, 2).string(message.amount.amount);
      writer.ldelim();
    }
    if (message.burnFromAddress !== "") {
      writer.tag(3, 2).string(message.burnFromAddress);
    }
    return writer;
  },

  decode(input: Uint8Array | BinaryReader, length?: number): any {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const end = length === undefined ? reader.len : reader.pos + length;
    const message: any = { sender: "", amount: undefined, burnFromAddress: "" };
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.sender = reader.string();
          break;
        case 2:
          message.amount = { denom: "", amount: "" };
          const limit = reader.uint32();
          const baseEnd = reader.pos + limit;
          while (reader.pos < baseEnd) {
            const tagCoin = reader.uint32();
            switch (tagCoin >>> 3) {
              case 1:
                message.amount.denom = reader.string();
                break;
              case 2:
                message.amount.amount = reader.string();
                break;
              default:
                reader.skipType(tagCoin & 7);
                break;
            }
          }
          break;
        case 3:
          message.burnFromAddress = reader.string();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromPartial(object: any): any {
    return {
      sender: object.sender ?? "",
      amount: object.amount ? { denom: object.amount.denom ?? "", amount: object.amount.amount ?? "" } : undefined,
      burnFromAddress: object.burnFromAddress ?? "",
    };
  },
};

// MsgChangeAdmin defines the MsgChangeAdmin type
export const MsgChangeAdminType: GeneratedType = {
  encode(message: any, writer = BinaryWriter.create()): BinaryWriter {
    if (message.sender !== "") {
      writer.tag(1, 2).string(message.sender);
    }
    if (message.denom !== "") {
      writer.tag(2, 2).string(message.denom);
    }
    if (message.newAdmin !== "") {
      writer.tag(3, 2).string(message.newAdmin);
    }
    return writer;
  },

  decode(input: Uint8Array | BinaryReader, length?: number): any {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    const end = length === undefined ? reader.len : reader.pos + length;
    const message = { sender: "", denom: "", newAdmin: "" };
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.sender = reader.string();
          break;
        case 2:
          message.denom = reader.string();
          break;
        case 3:
          message.newAdmin = reader.string();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromPartial(object: any): any {
    return {
      sender: object.sender ?? "",
      denom: object.denom ?? "",
      newAdmin: object.newAdmin ?? "",
    };
  },
};

// MsgSetDenomMetadata defines the MsgSetDenomMetadata type
export const MsgSetDenomMetadataType: GeneratedType = {
  encode(message: any, writer = BinaryWriter.create()): BinaryWriter {
    if (message.sender !== "") {
      writer.tag(1, 2).string(message.sender);
    }
    if (message.metadata !== undefined) {
      writer.tag(2, 2).fork();
      const md = message.metadata;
      if (md.description !== "") writer.tag(1, 2).string(md.description);
      if (md.denomUnits && md.denomUnits.length > 0) {
        for (const du of md.denomUnits) {
          writer.tag(2, 2).fork();
          if (du.denom !== "") writer.tag(1, 2).string(du.denom);
          if (du.exponent !== 0) writer.tag(2, 0).uint32(du.exponent);
          if (du.aliases && du.aliases.length > 0) {
            for (const alias of du.aliases) {
              writer.tag(3, 2).string(alias);
            }
          }
          writer.ldelim();
        }
      }
      if (md.base !== "") writer.tag(3, 2).string(md.base);
      if (md.display !== "") writer.tag(4, 2).string(md.display);
      if (md.name !== "") writer.tag(5, 2).string(md.name);
      if (md.symbol !== "") writer.tag(6, 2).string(md.symbol);
      if (md.uri && md.uri !== "") writer.tag(7, 2).string(md.uri);
      if (md.uriHash && md.uriHash !== "") writer.tag(8, 2).string(md.uriHash);
      writer.ldelim();
    }
    return writer;
  },

  decode(input: Uint8Array | BinaryReader, length?: number): any {
    return {};
  },

  fromPartial(object: any): any {
    return {
      sender: object.sender ?? "",
      metadata: object.metadata ? {
        description: object.metadata.description ?? "",
        denomUnits: (object.metadata.denomUnits ?? []).map((du: any) => ({
          denom: du.denom ?? "",
          exponent: du.exponent ?? 0,
          aliases: du.aliases ?? [],
        })),
        base: object.metadata.base ?? "",
        display: object.metadata.display ?? "",
        name: object.metadata.name ?? "",
        symbol: object.metadata.symbol ?? "",
        uri: object.metadata.uri ?? "",
        uriHash: object.metadata.uriHash ?? "",
      } : undefined,
    };
  },
};

// MsgCreateBalancerPoolType defines the MsgCreateBalancerPool type
export const MsgCreateBalancerPoolType: GeneratedType = {
  encode(message: any, writer = BinaryWriter.create()): BinaryWriter {
    if (message.sender !== "") {
      writer.tag(1, 2).string(message.sender);
    }
    if (message.poolParams !== undefined) {
      writer.tag(2, 2).fork();
      writer.tag(1, 2).string(toDecString(message.poolParams.swapFee ?? "0.003"));
      writer.tag(2, 2).string(toDecString(message.poolParams.exitFee ?? "0"));
      writer.ldelim();
    }
    if (message.poolAssets && message.poolAssets.length > 0) {
      for (const asset of message.poolAssets) {
        writer.tag(3, 2).fork();
        if (asset.token !== undefined) {
          writer.tag(1, 2).fork();
          writer.tag(1, 2).string(asset.token.denom);
          writer.tag(2, 2).string(asset.token.amount);
          writer.ldelim();
        }
        writer.tag(2, 2).string(asset.weight ?? "1");
        writer.ldelim();
      }
    }
    if (message.futurePoolGovernor !== "") {
      writer.tag(4, 2).string(message.futurePoolGovernor);
    }
    return writer;
  },

  decode(input: Uint8Array | BinaryReader, length?: number): any {
    return {};
  },

  fromPartial(object: any): any {
    return {
      sender: object.sender ?? "",
      poolParams: object.poolParams ? {
        swapFee: object.poolParams.swapFee ?? "0.003",
        exitFee: object.poolParams.exitFee ?? "0",
      } : undefined,
      poolAssets: (object.poolAssets ?? []).map((a: any) => ({
        token: a.token ? { denom: a.token.denom ?? "", amount: a.token.amount ?? "" } : undefined,
        weight: a.weight ?? "1",
      })),
      futurePoolGovernor: object.futurePoolGovernor ?? "",
    };
  },
};

// MsgSwapExactAmountInType defines the MsgSwapExactAmountIn type
export const MsgSwapExactAmountInType: GeneratedType = {
  encode(message: any, writer = BinaryWriter.create()): BinaryWriter {
    if (message.sender !== "") {
      writer.tag(1, 2).string(message.sender);
    }
    if (message.routes && message.routes.length > 0) {
      for (const route of message.routes) {
        writer.tag(2, 2).fork();
        if (route.poolId !== undefined && route.poolId !== "0" && route.poolId !== "") {
          writer.tag(1, 0).uint64(route.poolId);
        }
        if (route.tokenOutDenom !== "") {
          writer.tag(2, 2).string(route.tokenOutDenom);
        }
        writer.ldelim();
      }
    }
    if (message.tokenIn !== undefined) {
      writer.tag(3, 2).fork();
      writer.tag(1, 2).string(message.tokenIn.denom);
      writer.tag(2, 2).string(message.tokenIn.amount);
      writer.ldelim();
    }
    if (message.tokenOutMinAmount !== "") {
      writer.tag(4, 2).string(message.tokenOutMinAmount);
    }
    return writer;
  },

  decode(input: Uint8Array | BinaryReader, length?: number): any {
    return {};
  },

  fromPartial(object: any): any {
    return {
      sender: object.sender ?? "",
      routes: (object.routes ?? []).map((r: any) => ({
        poolId: r.poolId ?? "0",
        tokenOutDenom: r.tokenOutDenom ?? "",
      })),
      tokenIn: object.tokenIn ? { denom: object.tokenIn.denom ?? "", amount: object.tokenIn.amount ?? "" } : undefined,
      tokenOutMinAmount: object.tokenOutMinAmount ?? "",
    };
  },
};

// MsgJoinPoolType defines the MsgJoinPool type (add liquidity to an existing pool)
export const MsgJoinPoolType: GeneratedType = {
  encode(message: any, writer = BinaryWriter.create()): BinaryWriter {
    if (message.sender !== "") {
      writer.tag(1, 2).string(message.sender);
    }
    if (message.poolId !== undefined && message.poolId !== "0" && message.poolId !== "") {
      writer.tag(2, 0).uint64(message.poolId);
    }
    if (message.shareOutAmount !== "") {
      writer.tag(3, 2).string(message.shareOutAmount);
    }
    if (message.tokenInMaxs && message.tokenInMaxs.length > 0) {
      for (const coin of message.tokenInMaxs) {
        writer.tag(4, 2).fork();
        writer.tag(1, 2).string(coin.denom);
        writer.tag(2, 2).string(coin.amount);
        writer.ldelim();
      }
    }
    return writer;
  },

  decode(input: Uint8Array | BinaryReader, length?: number): any {
    return {};
  },

  fromPartial(object: any): any {
    return {
      sender: object.sender ?? "",
      poolId: object.poolId ?? "0",
      shareOutAmount: object.shareOutAmount ?? "0",
      tokenInMaxs: (object.tokenInMaxs ?? []).map((c: any) => ({ denom: c.denom ?? "", amount: c.amount ?? "" })),
    };
  },
};

// Create a Registry containing all standard types plus the custom Osmosis types
export const osmosisRegistry = new Registry([
  ...defaultRegistryTypes,
  ["/osmosis.tokenfactory.v1beta1.MsgCreateDenom", MsgCreateDenomType],
  ["/osmosis.tokenfactory.v1beta1.MsgMint", MsgMintType],
  ["/osmosis.tokenfactory.v1beta1.MsgBurn", MsgBurnType],
  ["/osmosis.tokenfactory.v1beta1.MsgChangeAdmin", MsgChangeAdminType],
  ["/osmosis.tokenfactory.v1beta1.MsgSetDenomMetadata", MsgSetDenomMetadataType],
  ["/osmosis.gamm.poolmodels.balancer.v1beta1.MsgCreateBalancerPool", MsgCreateBalancerPoolType],
  ["/osmosis.gamm.v1beta1.MsgSwapExactAmountIn", MsgSwapExactAmountInType],
  ["/osmosis.poolmanager.v1beta1.MsgSwapExactAmountIn", MsgSwapExactAmountInType],
  ["/osmosis.gamm.v1beta1.MsgJoinPool", MsgJoinPoolType],
]);
