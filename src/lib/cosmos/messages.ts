// Typed message builders for Osmosis Token Factory and GAMM.
// These return EncodeObjects suitable for SigningStargateClient.signAndBroadcast.

export interface Coin {
  denom: string;
  amount: string;
}

// --- Token Factory (osmosis.tokenfactory.v1beta1) ---

export const TF_TYPES = {
  CreateDenom: "/osmosis.tokenfactory.v1beta1.MsgCreateDenom",
  Mint: "/osmosis.tokenfactory.v1beta1.MsgMint",
  Burn: "/osmosis.tokenfactory.v1beta1.MsgBurn",
  ChangeAdmin: "/osmosis.tokenfactory.v1beta1.MsgChangeAdmin",
  SetDenomMetadata: "/osmosis.tokenfactory.v1beta1.MsgSetDenomMetadata",
} as const;

export function msgCreateDenom(sender: string, subdenom: string) {
  return { typeUrl: TF_TYPES.CreateDenom, value: { sender, subdenom } };
}

export function msgMint(sender: string, amount: Coin, mintToAddress?: string) {
  return {
    typeUrl: TF_TYPES.Mint,
    value: { sender, amount, mintToAddress: mintToAddress || sender },
  };
}

export function msgBurn(sender: string, amount: Coin, burnFromAddress?: string) {
  return {
    typeUrl: TF_TYPES.Burn,
    value: { sender, amount, burnFromAddress: burnFromAddress || sender },
  };
}

export function msgChangeAdmin(sender: string, denom: string, newAdmin: string) {
  return { typeUrl: TF_TYPES.ChangeAdmin, value: { sender, denom, newAdmin } };
}

export interface DenomMetadata {
  description: string;
  denomUnits: Array<{ denom: string; exponent: number; aliases: string[] }>;
  base: string;
  display: string;
  name: string;
  symbol: string;
  uri?: string;
  uriHash?: string;
}

export function msgSetDenomMetadata(sender: string, metadata: DenomMetadata) {
  return { typeUrl: TF_TYPES.SetDenomMetadata, value: { sender, metadata } };
}

// --- GAMM classic balancer pool (osmosis.gamm.poolmodels.balancer.v1beta1) ---

export const GAMM_CREATE_POOL_TYPE =
  "/osmosis.gamm.poolmodels.balancer.v1beta1.MsgCreateBalancerPool";

export interface PoolAsset {
  token: Coin;
  weight: string; // typically "1"
}

export function msgCreateBalancerPool(
  sender: string,
  poolAssets: PoolAsset[],
  swapFee = "0.003",
  exitFee = "0",
) {
  return {
    typeUrl: GAMM_CREATE_POOL_TYPE,
    value: {
      sender,
      poolParams: { swapFee, exitFee },
      poolAssets,
      futurePoolGovernor: "",
    },
  };
}

// --- GAMM join pool / add liquidity (osmosis.gamm.v1beta1) ---

export const GAMM_JOIN_POOL_TYPE = "/osmosis.gamm.v1beta1.MsgJoinPool";

export function msgJoinPool(
  sender: string,
  poolId: string,
  shareOutAmount: string,
  tokenInMaxs: Coin[],
) {
  return {
    typeUrl: GAMM_JOIN_POOL_TYPE,
    value: { sender, poolId, shareOutAmount, tokenInMaxs },
  };
}

// --- GAMM swap (osmosis.gamm.v1beta1) ---

export const GAMM_SWAP_TYPE = "/osmosis.gamm.v1beta1.MsgSwapExactAmountIn";

export interface SwapAmountInRoute {
  poolId: string; // uint64 as string
  tokenOutDenom: string;
}

export function msgSwapExactAmountIn(
  sender: string,
  routes: SwapAmountInRoute[],
  tokenIn: Coin,
  tokenOutMinAmount: string,
) {
  return {
    typeUrl: GAMM_SWAP_TYPE,
    value: { sender, routes, tokenIn, tokenOutMinAmount },
  };
}

// --- Concentrated Liquidity swap (osmosis.concentratedliquidity.v1beta1) ---
export const CL_SWAP_TYPE = "/osmosis.concentratedliquidity.v1beta1.MsgSwapExactAmountIn";

// --- Bank send ---

export const BANK_SEND_TYPE = "/cosmos.bank.v1beta1.MsgSend";

export function msgSend(fromAddress: string, toAddress: string, amount: Coin[]) {
  return { typeUrl: BANK_SEND_TYPE, value: { fromAddress, toAddress, amount } };
}
