import "dotenv/config";
import { complainsRouter } from "@/server/api/routers/complains";
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

async function main() {
  console.log("\n=== 1. filterOptions 街镇下拉 ===");
  const streets = await caller.filterOptions({});
  console.log(`  街镇数量: ${streets.streets.length}`);
  console.log(`  样例街镇: ${streets.streets.slice(0, 5).join(", ")}`);
  assert(streets.streets.length > 0, "街镇下拉非空(从数据提取)");

  const firstStreet = streets.streets[0];
  console.log(`\n=== 2. filterOptions 网格联动(${firstStreet}) ===`);
  const gridsAll = await caller.filterOptions({});
  const gridsScoped = await caller.filterOptions({ streetName: firstStreet });
  console.log(`  全部网格数量: ${gridsAll.grids.length}`);
  console.log(`  ${firstStreet} 下网格数量: ${gridsScoped.grids.length}`);
  console.log(`  样例网格: ${gridsScoped.grids.slice(0, 5).join(", ")}`);
  assert(
    gridsScoped.grids.length <= gridsAll.grids.length,
    "联动后网格数 <= 全部网格数",
  );
  assert(
    gridsScoped.grids.every((g) => typeof g === "string" && g.length > 0),
    "网格选项均为非空字符串",
  );

  console.log(`\n=== 3. list 分页(page=1,pageSize=10) ===`);
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
  assert(
    page1.items.every((it) => typeof it.reporter === "string"),
    "reporter 已规范化(非 any)",
  );

  console.log(`\n=== 4. list 分页(page=2,pageSize=10) + total ===`);
  const page2 = await caller.list({
    streetName: firstStreet,
    page: 2,
    pageSize: 10,
  });
  console.log(`  total: ${page2.total}, 本页条数: ${page2.items.length}`);
  assert(page1.total === page2.total, "两页 total 一致");
  const ids1 = new Set(page1.items.map((i) => i.taskId));
  const overlap = page2.items.filter((i) => ids1.has(i.taskId)).length;
  assert(overlap === 0, "第1页与第2页无重复 taskId(偏移分页正确)");

  console.log(`\n=== 5. personHouseTree(网格联动: ${firstStreet}, limit=100) ===`);
  const tree = await caller.personHouseTree({ streetName: firstStreet, limit: 100 });
  const kindCount: Record<string, number> = {};
  for (const a of tree.areas) {
    kindCount[a.kind] = (kindCount[a.kind] ?? 0) + 1;
  }
  console.log(`  区域总数: ${tree.areas.length}`);
  console.log(`  stats: areas=${tree.stats.areas} buildings=${tree.stats.buildings} rooms=${tree.stats.rooms} persons=${tree.stats.persons}`);
  console.log(`  按 kind 分布: ${JSON.stringify(kindCount)}`);
  console.log(`  区域名称样例: ${tree.areas.slice(0, 12).map((a) => a.name).join("、")}`);
  assert(tree.areas.length > 0, "人房树生成区域节点");
  assert(
    tree.areas.every((a) => a.kind === "community"),
    "区域一律为 community 类(路名/poi/village 不再冒充小区)",
  );
  // 关键修复:除「未分类区域」外,任何小区名不得以 路/街/大道 结尾(路名不得冒充小区)
  const roadLike = tree.areas.filter(
    (a) => a.name !== "未分类区域" && /(路|街|大道)$/.test(a.name),
  );
  assert(roadLike.length === 0, `路名未冒充小区(命中: ${roadLike.map((a) => a.name).join("、") || "无"})`);
  const totalBuilding = tree.areas.reduce((s, a) => s + a.buildingCount, 0);
  assert(totalBuilding === tree.stats.buildings, "楼栋统计与区域聚合一致");

  console.log(`\n=== 6. mlFields 三类区域识别(单地址) ===`);
  const { standardizeService } = await import("@/server/services/standardizeService");
  const samples = [
    "阳光花园小区3栋2单元501室",
    "万达广场B座18楼",
    "王家宅村12号",
  ];
  for (const addr of samples) {
    const f = await standardizeService.mlFields(addr);
    console.log(`  "${addr}" → ${JSON.stringify(f)}`);
    const hasArea = !!(f.community || f.poi || f.village);
    assert(hasArea, `mlFields 从「${addr}」解析出区域要素(小区/POI/村)`);
  }
  // personHouseTree 内部已用 mlFields;直接验证 tree 含 poi/village 若存在
  const hasPoi = tree.areas.some((a) => a.kind === "poi");
  const hasVillage = tree.areas.some((a) => a.kind === "village");
  const hasCommunity = tree.areas.some((a) => a.kind === "community");
  console.log(`  community=${hasCommunity} poi=${hasPoi} village=${hasVillage}`);
  assert(hasCommunity || hasPoi || hasVillage, "至少存在一种区域类型");

  console.log(`\n=== 7. 组合筛选(list: 街镇+网格) ===`);
  const grid = gridsScoped.grids[0];
  if (grid) {
    const combo = await caller.list({
      streetName: firstStreet,
      gridName: grid,
      page: 1,
      pageSize: 20,
    });
    console.log(`  ${firstStreet} / ${grid} → total=${combo.total}`);
    assert(
      combo.items.every(
        (it) => it.streetName === firstStreet && it.gridName === grid,
      ),
      "组合筛选结果街镇/网格均匹配",
    );
  } else {
    console.log("  (该街镇无网格,跳过组合筛选)");
  }

  console.log("\n完成。");
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
