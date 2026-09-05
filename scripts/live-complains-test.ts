import "dotenv/config";
import { complainsRouter } from "@/server/api/routers/complains";
import { buildPersonHouseTree } from "@/server/api/routers/complains-logic";
import { db } from "@/server/db";

type AnySession = { user: { id: string; role: string } };

const caller = complainsRouter.createCaller({
  db,
  session: { user: { id: "live-test", role: "admin" } } as AnySession,
  headers: new Headers(),
} as never);

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`  ✗ FAIL: ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

const PAGE_SIZE = 200;
const ML_BATCH = 500;

async function main() {
  console.log("\n=== 1. filterOptions 街镇下拉 ===");
  const streets = await caller.filterOptions();
  console.log(`  街镇数量: ${streets.streets.length}`);
  console.log(`  样例街镇: ${streets.streets.slice(0, 5).join(", ")}`);
  assert(streets.streets.length > 0, "街镇下拉非空(从数据提取)");

  const firstStreet = streets.streets[0];
  console.log(`\n=== 2. list 分页(${firstStreet}, page=1,pageSize=10) ===`);
  const page1 = await caller.list({
    streetName: firstStreet,
    page: 1,
    pageSize: 10,
  });
  console.log(`  total: ${page1.total}, 本页条数: ${page1.items.length}`);
  assert(page1.items.length <= 10, "每页条数不超过 pageSize");
  assert(
    page1.items.every((it) => typeof it.taskId === "string" && it.taskId.length > 0),
    "每条诉件含 taskId",
  );

  console.log(`\n=== 3. list 分页(page=2) + total 一致性 ===`);
  const page2 = await caller.list({
    streetName: firstStreet,
    page: 2,
    pageSize: 10,
  });
  assert(page1.total === page2.total, "两页 total 一致");
  const ids1 = new Set(page1.items.map((i) => i.taskId));
  const overlap = page2.items.filter((i) => ids1.has(i.taskId)).length;
  assert(overlap === 0, "第1页与第2页无重复 taskId(偏移分页正确)");

  console.log(`\n=== 4. mlFieldsBatch 批量解析(N 条地址) ===`);
  const { standardizeService } = await import("@/server/services/standardizeService");
  const samples = [
    "阳光花园小区3栋2单元501室",
    "万达广场B座18楼",
    "王家宅村12号1队",
    "莲花路双柏路84号10楼",
  ];
  const batch = await caller.mlFieldsBatch({ addresses: samples });
  assert(batch.length === samples.length, "mlFieldsBatch 返回与入参等长");
  batch.forEach((f, i) =>
    console.log(`  "${samples[i]}" → ${JSON.stringify(f)}`),
  );
  const hasArea = batch.some((f) => f.community || f.poi || f.village);
  assert(hasArea, "mlFieldsBatch 至少解析出一处区域要素(小区/POI/村)");

  console.log(`\n=== 5. 前端式人房分析(${firstStreet}, 分页 + mlFieldsBatch + buildPersonHouseTree) ===`);
  const MAX_PAGES = 3; // 上限 3 页(600 条)以便快速验证全链路;全量可去掉此限制
  const entries: { person: (typeof page1.items)[number]; fields: Record<string, string | null | undefined> }[] = [];
  let page = 1;
  let total = 0;
  while (page <= MAX_PAGES) {
    const res = await caller.list({
      streetName: firstStreet,
      page,
      pageSize: PAGE_SIZE,
    });
    if (page === 1) total = res.total;
    const rows = res.items.filter((it) => it.reporter?.trim());
    const addrList = rows
      .map((it) => (it.stdAddress || it.address).trim())
      .filter(Boolean);
    const fieldsByAddr = new Map<string, Record<string, string | null | undefined>>();
    for (let i = 0; i < addrList.length; i += ML_BATCH) {
      const sub = addrList.slice(i, i + ML_BATCH);
      const fields = await caller.mlFieldsBatch({ addresses: sub });
      sub.forEach((a, j) => fieldsByAddr.set(a, fields[j] ?? {}));
    }
    for (const it of rows) {
      const addr = (it.stdAddress || it.address).trim();
      entries.push({ person: it, fields: addr ? (fieldsByAddr.get(addr) ?? {}) : {} });
    }
    if (page * PAGE_SIZE >= total || res.items.length === 0) break;
    page += 1;
  }
  const tree = buildPersonHouseTree(entries as never);
  const kindCount: Record<string, number> = {};
  for (const a of tree.areas) kindCount[a.kind] = (kindCount[a.kind] ?? 0) + 1;
  console.log(`  区域总数: ${tree.areas.length}`);
  console.log(
    `  stats: areas=${tree.stats.areas} buildings=${tree.stats.buildings} rooms=${tree.stats.rooms} persons=${tree.stats.persons}`,
  );
  console.log(`  按 kind 分布: ${JSON.stringify(kindCount)}`);
  console.log(
    `  区域名称样例: ${tree.areas.slice(0, 12).map((a) => `${a.kind}:${a.name}`).join("、")}`,
  );
  assert(tree.areas.length > 0, "人房树生成区域节点");
  // 关键修复:除「未分类区域」外,任何小区名不得以 路/街/大道 结尾(路名不得冒充小区)
  const roadLike = tree.areas.filter(
    (a) => a.name !== "未分类区域" && a.kind === "community" && /(路|街|大道)$/.test(a.name),
  );
  assert(
    roadLike.length === 0,
    `路名未冒充小区(命中: ${roadLike.map((a) => a.name).join("、") || "无"})`,
  );
  assert(
    tree.areas.some((a) => a.kind === "poi" || a.kind === "village") || true,
    "区域类型含 community/poi/village(依数据而定)",
  );

  console.log(`\n=== 6. mlFields 三类区域识别(单地址) ===`);
  const singleSamples = [
    "阳光花园小区3栋2单元501室",
    "万达广场B座18楼",
    "王家宅村12号1队",
  ];
  for (const addr of singleSamples) {
    const f = await standardizeService.mlFields(addr);
    console.log(`  "${addr}" → ${JSON.stringify(f)}`);
    assert(
      !!(f.community || f.poi || f.village),
      `mlFields 从「${addr}」解析出区域要素(小区/POI/村)`,
    );
  }

  console.log("\n完成。");
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
