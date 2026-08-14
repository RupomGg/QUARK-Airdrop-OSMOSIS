import { DEFAULT_LCD } from "../src/lib/cosmos/chain.js";

async function testQuery(limit) {
  console.log(`Testing with limit = ${limit}...`);
  const urlForward = `${DEFAULT_LCD}/osmosis/gamm/v1beta1/pools?pagination.limit=${limit}`;
  const urlReverse = `${DEFAULT_LCD}/osmosis/gamm/v1beta1/pools?pagination.limit=${limit}&pagination.reverse=true`;

  const start = Date.now();
  try {
    const [resF, resR] = await Promise.all([
      fetch(urlForward, { headers: { Accept: "application/json" } }).then(r => {
        console.log(`Forward: ok=${r.ok}, status=${r.status}`);
        return r.ok ? r.json() : null;
      }),
      fetch(urlReverse, { headers: { Accept: "application/json" } }).then(r => {
        console.log(`Reverse: ok=${r.ok}, status=${r.status}`);
        return r.ok ? r.json() : null;
      })
    ]);

    const pools = [];
    if (resF?.pools) pools.push(...resF.pools);
    if (resR?.pools) pools.push(...resR.pools);
    console.log(`Time taken: ${Date.now() - start}ms`);
    console.log(`Total pools fetched: ${pools.length}`);
  } catch (e) {
    console.error("Failed:", e.message);
  }
}

async function main() {
  await testQuery(100);
  console.log("---");
  await testQuery(20);
}

main();
