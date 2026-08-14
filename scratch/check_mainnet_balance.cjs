const ADDR = "osmo18m3pl3jl8wmnvckf3a02ydqygxx0m2tfzky5qg";
fetch(`https://lcd.osmosis.zone/cosmos/bank/v1beta1/balances/${ADDR}`)
  .then((r) => r.json())
  .then((d) => console.log(JSON.stringify(d, null, 2)))
  .catch((e) => console.error("ERR", e.message));
