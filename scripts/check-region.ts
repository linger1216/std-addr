import { readFileSync } from "node:fs";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

// 直接读 .env,DATABASE_URL 即可(绕过 src/env 的全量校验)
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
  const all = await db.region.findMany({
    select: { id: true, code: true, name: true, level: true, parentCode: true, type: true },
  });
  const byCode = new Map(all.map((r) => [r.code, r]));
  const top = all.filter((r) => r.parentCode === null);
  const levels = new Map<number, number>();
  const types = new Map<string | null, number>();
  for (const r of all) {
    levels.set(r.level, (levels.get(r.level) ?? 0) + 1);
    types.set(r.type ?? null, (types.get(r.type ?? null) ?? 0) + 1);
  }
  console.log("total regions:", all.length);
  console.log("parentCode=null (顶层) 数量:", top.length);
  console.log("顶层 code/name:", top.map((r) => `${r.code}/${r.name}`).slice(0, 20));
  console.log("上海市(310) 存在:", byCode.has("310"));
  console.log("闵行区(310112) 存在:", byCode.has("310112"));
  console.log("level 分布:", [...levels.entries()].sort((a, b) => a[0] - b[0]));
  console.log("type 分布:", [...types.entries()]);
}

main()
  .catch((e) => {
    console.error("查询失败(可能数据库不可达):", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
