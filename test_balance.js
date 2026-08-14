import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { StargateClient } from "@cosmjs/stargate";

const mnemonic = "ball eager ordinary rain misery carbon shiver swap panther transfer door patch length coyote green burger sibling recall uncover wine topic unveil extra egg";
const prefix = "osmo";
const rpcUrl = "https://rpc.osmosis.zone";

async function main() {
  try {
    console.log("Deriving wallet...");
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix });
    const [account] = await wallet.getAccounts();
    const address = account.address;
    console.log("Derived Address:", address);

    console.log("Connecting to RPC:", rpcUrl);
    const client = await StargateClient.connect(rpcUrl);
    console.log("Connected successfully!");

    console.log("Fetching balances...");
    const balances = await client.getAllBalances(address);
    console.log("Balances:", JSON.stringify(balances, null, 2));

    client.disconnect();
    console.log("Disconnected.");
  } catch (error) {
    console.error("Error in execution:", error);
  }
}

main();
