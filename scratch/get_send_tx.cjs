const HASH = "4A7E2B4C56152505FF5B3939CE73B4D5642F187821222D8EABA79F44FBAB11CA";
fetch(`https://lcd.testnet.osmosis.zone/cosmos/tx/v1beta1/txs/${HASH}`)
  .then((r) => r.json())
  .then((d) => {
    console.log(JSON.stringify(d.tx.body.messages[0], null, 2));
  })
  .catch((e) => console.error("ERR", e));
