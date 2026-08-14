const ADDR = "osmo122gaydjxh50pqpqhzdkz2sfsjvpw0x6xtfztmc";
const query = `message.sender='${ADDR}'`;
const url = `https://lcd.testnet.osmosis.zone/cosmos/tx/v1beta1/txs?query=${encodeURIComponent(query)}&order_by=ORDER_BY_DESC&pagination.limit=8`;
fetch(url)
  .then(async (r) => {
    const d = await r.json();
    if (!d.tx_responses) {
      console.log("no tx_responses, raw:", JSON.stringify(d).slice(0, 800));
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
      console.log(tx.timestamp, tx.txhash, "code=" + tx.code, JSON.stringify(msgs));
    }
  })
  .catch((e) => console.error("ERR", e));
