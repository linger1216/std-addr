/**
 * 一次性回填 regions.type 字段。
 *
 * 历史背景:Region.type 是 String?,此前未写入,导致 DB 里所有行 type=NULL。
 * 新增 inferRegionType(name) 后,可按节点 name 把 9 个合法值之一回填进去;
 * 无法推断的(纯机构名/非典型命名)保留 NULL,后续人工编辑。
 *
 * 与 router 里 backfillType mutation 逻辑等价:
 *   - 只处理 type IS NULL 的行(幂等,跑两次不会破坏已有数据)
 *   - 推断不出的样本打印到 stdout,方便后续人工核对
 *   - 返回扫/填/跳统计
 *
 * 用法:
 *   pnpm db:backfill-region-type
 *
 * 或直接:
 *   tsx scripts/backfill-region-type.ts
 */
import "dotenv/config";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client";
import { inferRegionType, REGION_TYPES } from "../src/lib/region-import";

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

type SkippedSample = { id: string; code: string; name: string };

async function main() {
  const total = await db.region.count();
  const nullCount = await db.region.count({ where: { type: null } });

  console.log(`regions 总数: ${total}`);
  console.log(`待回填(type IS NULL): ${nullCount}`);
  console.log(`REGION_TYPES = ${REGION_TYPES.join(" / ")}`);
  console.log("--- 开始回填 ---");

  const rows = await db.region.findMany({
    where: { type: null },
    select: { id: true, code: true, name: true },
  });

  let filled = 0;
  let skipped = 0;
  const skippedSamples: SkippedSample[] = [];

  for (const row of rows) {
    const inferred = inferRegionType(row.name);
    if (inferred === null) {
      skipped++;
      if (skippedSamples.length < 20) {
        skippedSamples.push({ id: row.id, code: row.code, name: row.name });
      }
      continue;
    }
    await db.region.update({
      where: { id: row.id },
      data: { type: inferred },
    });
    filled++;
  }

  console.log("--- 回填完成 ---");
  console.log(`扫描: ${rows.length}`);
  console.log(`已填: ${filled}`);
  console.log(`跳过(无法推断): ${skipped}`);
  if (skippedSamples.length > 0) {
    console.log("\n无法推断的样本(最多 20 条,可能需要人工编辑):");
    for (const s of skippedSamples) {
      console.log(`  - ${s.code}  ${s.name}`);
    }
  }

  // 各 type 计数(用于核对分布是否合理)
  const grouped = await db.region.groupBy({
    by: ["type"],
    _count: { _all: true },
  });
  console.log("\n回填后 type 分布:");
  for (const g of grouped) {
    console.log(`  ${g.type ?? "(NULL)"}: ${g._count._all}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
