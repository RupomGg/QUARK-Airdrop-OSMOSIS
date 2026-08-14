import { DEFAULT_LCD } from "../src/lib/cosmos/chain.js";

async function checkPool(id) {
  try {
    const res = await fetch(`${DEFAULT_LCD}/osmosis/gamm/v1beta1/pools/${id}`, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      console.log(`Pool ${id} fetch failed with status: ${res.status}`);
      return;
    }
    const data = await res.json();
    console.log(`Pool ${id} assets:`, JSON.stringify(data.pool?.pool_assets || data.pool?.poolAssets || [], null, 2));
  } catch (e) {
    console.error(`Pool ${id} error:`, e.message);
  }
}

async function main() {
  await checkPool(1464);
  console.log("---");
  await checkPool(812);
  console.log("---");
  await checkPool(678);
}

main();
