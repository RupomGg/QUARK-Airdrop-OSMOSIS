const { DirectSecp256k1HdWallet } = require("@cosmjs/proto-signing");

(async () => {
  const wallet = await DirectSecp256k1HdWallet.generate(24, { prefix: "osmo" });
  const [account] = await wallet.getAccounts();
  console.log("MNEMONIC=" + wallet.mnemonic);
  console.log("ADDRESS=" + account.address);
})();
