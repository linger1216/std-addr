/**
 * 一次性迁移:把 regions 表中"村委会"节点的具体村名写入 villages 表。
 *
 * 背景:
 *   regions 表历史 type=NULL,具体村信息(居委会、村委会等)按节点 name 形态存放;
 *   现 villages 表已建好,但为空。本次迁移把 type='村委会' 的 region 节点的
 *   "具体村名"剥出来后写入 villages。
 *
 * 算法:
 *   1. 扫描 regions 表,按 name 调 inferRegionType(name) === '村委会' 过滤
 *      (同时排除机构节点和无后缀的纯行政区)
 *   2. name 后缀按"最长优先"剥除:村民委员会 → 村委 → 村委会 → 村
 *      (避免"李巷村民委员会"被"村委"提前剥成"李巷民委员会")
 *   3. 幂等性:villages.name + villages.regionId 命中则跳过
 *      (多次运行不会重复插入;若 name 改了 / regionId 变了,会重写为新行)
 *
 * 用法:
 *   pnpm db:migrate-regions-to-villages            # 实际写入
 *   pnpm db:migrate-regions-to-villages --dry-run  # 仅打印统计,不写库
 */
import "dotenv/config";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { Prisma, PrismaClient } from "../generated/prisma/client";
import { inferRegionType } from "../src/lib/region-import";
import { stripVillageSuffix } from "../src/lib/village-name";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL 未配置,请在 .env 里设置");
}

const url = new URL(process.env.DATABASE_URL);
const adapter = new PrismaMariaDb({
  host: url.hostname,
  port: Number(url.port) || 3306,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  connectionLimit: 5,
});
const db = new PrismaClient({ adapter });

const DRY_RUN = process.argv.includes("--dry-run");

type Row = { id: string; code: string; name: string };

async function main() {
  const villageCountBefore = await db.village.count();
  const regionCount = await db.region.count();

  console.log(`regions 总数: ${regionCount}`);
  console.log(`villages 当前行数: ${villageCountBefore}`);
  if (villageCountBefore > 0) {
    console.log(
      `⚠️  villages 表已有 ${villageCountBefore} 行,本次仅按 (name+regionId) 幂等跳过,不会覆盖`,
    );
  }
  if (DRY_RUN) {
    console.log("--- 干跑模式:仅统计,不写库 ---\n");
  } else {
    console.log("--- 开始迁移 ---\n");
  }

  // 全量加载 region,前端过滤;数据量小(549)无需分页
  const regions: Row[] = await db.region.findMany({
    select: { id: true, code: true, name: true },
  });

  const candidates = regions.filter(
    (r) => inferRegionType(r.name) === "村委会",
  );
  console.log(`region 中 type='村委会' 的节点: ${candidates.length}`);

  let created = 0;
  let skipped = 0;
  let failed = 0;
  const failedSamples: Array<{ code: string; name: string; err: string }> = [];
  const sampleNames: Array<{ code: string; raw: string; stripped: string }> = [];

  for (const row of candidates) {
    const stripped = stripVillageSuffix(row.name);
    if (!stripped) {
      failed++;
      failedSamples.push({ code: row.code, name: row.name, err: "剥后缀为空" });
      continue;
    }
    if (sampleNames.length < 10) {
      sampleNames.push({ code: row.code, raw: row.name, stripped });
    }

    // 幂等:同 name + regionId 已存在则跳过
    const existing = await db.village.findFirst({
      where: { name: stripped, regionId: row.id },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      created++;
      continue;
    }

    try {
      await db.village.create({
        data: {
          name: stripped,
          // alias 是 JSON 列;迁移时 village 通常没有别名,写 JsonNull(等价 NULL)
          alias: Prisma.JsonNull,
          regionId: row.id,
          status: 1,
          createdAt: new Date(),
        },
      });
      created++;
    } catch (err) {
      failed++;
      failedSamples.push({
        code: row.code,
        name: row.name,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log("\n--- 迁移完成 ---");
  console.log(`候选:    ${candidates.length}`);
  console.log(`已写入:  ${created}${DRY_RUN ? " (干跑未实际写入)" : ""}`);
  console.log(`跳过:    ${skipped} (已存在)`);
  console.log(`失败:    ${failed}`);
  if (sampleNames.length > 0) {
    console.log("\n样本(原始 → 剥后缀):");
    for (const s of sampleNames) {
      console.log(`  - ${s.code}  ${s.raw}  →  ${s.stripped}`);
    }
  }
  if (failedSamples.length > 0) {
    console.log("\n失败样本:");
    for (const f of failedSamples) {
      console.log(`  - ${f.code}  ${f.name}  →  ${f.err}`);
    }
  }

  if (!DRY_RUN) {
    const villageCountAfter = await db.village.count();
    console.log(`\nvillages 行数: ${villageCountBefore} → ${villageCountAfter}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
