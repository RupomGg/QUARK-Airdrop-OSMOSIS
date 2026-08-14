const ADDR = "osmo122gaydjxh50pqpqhzdkz2sfsjvpw0x6xtfztmc";
const url = `https://lcd.testnet.osmosis.zone/cosmos/tx/v1beta1/txs?events=message.sender%3D%27${ADDR}%27&order_by=ORDER_BY_DESC&pagination.limit=8`;
console.log("fetching:", url);
fetch(url)
  .then(async (r) => {
    console.log("status:", r.status);
    const d = await r.json();
    if (!d.tx_responses) {
      console.log("no tx_responses, raw:", JSON.stringify(d).slice(0, 500));
      return;
    }
    for (const tx of d.tx_responses) {
      const msgs = (tx.tx?.body?.messages || []).map((m) => {
        const type = m["@type"];
        const extra = m.mintToAddress
          ? ` mintTo=${m.mintToAddress} amt=${JSON.stringify(m.amount)}`
          : m.toAddress
            ? ` to=${m.toAddress} amt=${JSON.stringify(m.amount)}`
            : "";
        return type + extra;
      });
      console.log(tx.height, tx.txhash, "code=" + tx.code, JSON.stringify(msgs));
    }
  })
  .catch((e) => console.error("ERR", e));
