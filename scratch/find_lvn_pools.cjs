const LVN_DENOM = "factory/osmo1mlng7pz4pnyxtpq0akfwall37czyk9lukaucsrn30ameplhhshtqdvfm5c/ulvn";
const LCD = "https://osmosis-api.polkachu.com";

async function fetchAllPages(path) {
  const pools = [];
  let nextKey = null;
  for (let i = 0; i < 50; i++) {
    const qs = new URLSearchParams({ "pagination.limit": "1000" });
    if (nextKey) qs.set("pagination.key", nextKey);
    const res = await fetch(`${LCD}${path}?${qs}`);
    const data = await res.json();
    if (data.pools) pools.push(...data.pools);
    nextKey = data?.pagination?.next_key ?? null;
    if (!nextKey) break;
  }
  return pools;
}

(async () => {
  const gamm = await fetchAllPages("/osmosis/gamm/v1beta1/pools");
  const matches = gamm.filter((p) => {
    const assets = p.pool_assets || [];
    return assets.some((a) => a.token.denom === LVN_DENOM);
  });
  console.log("GAMM pools with LVN:", matches.length);
  for (const m of matches) {
    console.log(m.id, m.pool_assets.map((a) => a.token.denom + ":" + a.token.amount));
  }
})();
