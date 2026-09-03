import { readFileSync } from "node:fs";
import { PrismaClient, Prisma } from "../generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import {
  injectRegionAdminRoots,
  inferRegionType,
  type RegionImportItem,
  type RegionType,
} from "../src/lib/region-import";
import { parseAliasEntries } from "../src/lib/alias-entries";

// 直接读 .env,绕过 src/env 全量校验(仅需 DATABASE_URL)
function loadEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m?.[1] !== undefined) out[m[1]] = (m[2] ?? "").replace(/^["']|["']$/g, "");
  }
  return out;
}
const env = loadEnv(".env");
const url = new URL(env.DATABASE_URL as string);
const adapter = new PrismaMariaDb({
  host: url.hostname,
  port: Number(url.port) || 3306,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  connectionLimit: 5,
  allowPublicKeyRetrieval: true,
});
const db = new PrismaClient({ adapter });

async function main() {
  const rows = await db.region.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      level: true,
      type: true,
      alias: true,
      parentCode: true,
      fullName: true,
      sortOrder: true,
      status: true,
    },
  });
  console.log(`现存 region 行数: ${rows.length}`);

  // DB 行 → RegionImportItem(复用导入层同一套转换)
  const items: RegionImportItem[] = rows.map((r) => ({
    code: r.code,
    name: r.name,
    parentCode: r.parentCode,
    level: r.level,
    fullName: r.fullName ?? r.name,
    sortOrder: r.sortOrder,
    type: (r.type as RegionType | null) ?? inferRegionType(r.name),
    alias: parseAliasEntries(r.alias),
  }));

  // 自动补 上海市(310)/闵行区(310112) 根 + 按 type 重算 level + 顶层挂到 310112
  const fixed = injectRegionAdminRoots(items);

  const toAlias = (a: string[]) =>
    a.length > 0 ? a : Prisma.JsonNull;

  let created = 0;
  let updated = 0;
  await db.$transaction(async (tx) => {
    for (const it of fixed) {
      const data = {
        name: it.name,
        level: it.level,
        parentCode: it.parentCode,
        fullName: it.fullName,
        sortOrder: it.sortOrder,
        type: it.type ?? null,
        alias: toAlias(it.alias),
        status: 1,
      };
      await tx.region.upsert({
        where: { code: it.code },
        create: { code: it.code, ...data, createdAt: new Date() },
        update: data,
      });
      if (rows.some((r) => r.code === it.code)) updated++;
      else created++;
    }
  });

  console.log(`完成:新增 ${created} 行(根),更新 ${updated} 行`);
  const after = await db.region.findMany({
    select: { code: true, name: true, level: true, parentCode: true, type: true },
    where: { OR: [{ code: "310" }, { code: "310112" }] },
  });
  console.log("新增/补全的根:", after);
}

main()
  .catch((e) => {
    console.error("执行失败:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
