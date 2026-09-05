import "dotenv/config";
import { complainsRouter } from "@/server/api/routers/complains";
import { db } from "@/server/db";

const caller = complainsRouter.createCaller({
  db,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: { user: { id: "ml-test", role: "admin" } } as any,
  headers: new Headers(),
} as never);

async function main() {
  // 取最近 100 条含地址的诉件
  const rows = (await db.$queryRawUnsafe<
    { taskid: string; address: string | null; std_address: string | null }[]
  >(
    `SELECT taskid, address, std_address FROM complains
     WHERE (address IS NOT NULL AND address <> '') OR (std_address IS NOT NULL AND std_address <> '')
     ORDER BY discovertime DESC LIMIT 100`,
  )) as { taskid: string; address: string | null; std_address: string | null }[];

  const addresses = rows.map((r) => (r.std_address || r.address || "").trim()).filter(Boolean);
  console.log(`\n取到地址 ${addresses.length} 条(去空后)`);
  if (addresses.length === 0) {
    console.log("无可用地址,退出。");
    await db.$disconnect();
    return;
  }

  console.log(`\n调用 mlFieldsBatch(${addresses.length} 条)…`);
  const started = Date.now();
  let ok = 0;
  let errored = 0;
  const fieldsArr: Record<string, unknown>[] = new Array(addresses.length).fill({});
  try {
    const res = await caller.mlFieldsBatch({ addresses });
    fieldsArr.length = 0;
    fieldsArr.push(...res);
    ok = res.length;
  } catch (e) {
    errored = 1;
    console.error("mlFieldsBatch 抛出异常:", e);
  }
  const elapsed = Date.now() - started;
  console.log(`耗时 ${elapsed}ms, 返回 ${ok} 条, 异常 ${errored}`);

  // 统计解析出区域要素的条数
  let withArea = 0;
  let withCommunity = 0;
  let withPoi = 0;
  let withVillage = 0;
  let withTeamGroup = 0;
  let emptyFields = 0;
  for (const f of fieldsArr) {
    const has = !!(f.community || f.poi || f.village);
    if (has) withArea++;
    if (f.community) withCommunity++;
    if (f.poi) withPoi++;
    if (f.village) withVillage++;
    if (f.team || f.group) withTeamGroup++;
    if (!has && !f.building && !f.room && !f.road) emptyFields++;
  }
  console.log("\n解析统计:");
  console.log(`  解析出区域(小区/POI/村): ${withArea}/${fieldsArr.length}`);
  console.log(`    其中 小区: ${withCommunity}, POI: ${withPoi}, 村: ${withVillage}`);
  console.log(`  含 队/组: ${withTeamGroup}`);
  console.log(`  完全空字段(无任何要素): ${emptyFields}/${fieldsArr.length}`);

  console.log("\n样例(前 8 条):");
  for (let i = 0; i < Math.min(8, addresses.length); i++) {
    console.log(`  "${addresses[i]}" → ${JSON.stringify(fieldsArr[i] ?? {})}`);
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
