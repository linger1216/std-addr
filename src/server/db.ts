import { env } from "@/env";
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const url = new URL(env.DATABASE_URL);
// mysql2 选项：MySQL 8 默认 caching_sha2_password 在未走 SSL 时需要显式允许公钥检索
// 参考：https://github.com/sidorares/node-mysql2#api-and-configuration
const adapter = new PrismaMariaDb({
  host: url.hostname,
  port: Number(url.port) || 3306,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  connectionLimit: 5,
  allowPublicKeyRetrieval: true,
});

/**
 * 把 Prisma 的 ? 占位符替换为实际参数值,输出可直接复制执行的 SQL。
 * e.params 是 JSON 数组字符串(MySQL/MariaDB 驱动),按出现顺序逐一替换:
 * 字符串加单引号并转义,数字/布尔原样,null/undefined → NULL,对象(Date/JSON)按字面量。
 * 解析失败则原样返回(仅缺参数),不影响主流程。
 */
function inlineParams(query: string, params: string): string {
  let values: unknown[];
  try {
    const parsed: unknown = JSON.parse(params);
    if (!Array.isArray(parsed)) return query;
    values = parsed;
  } catch {
    return query;
  }
  let i = 0;
  return query.replace(/\?/g, () => {
    const v = values[i++];
    if (v === null || v === undefined) return "NULL";
    if (typeof v === "number" || typeof v === "bigint") return String(v);
    if (typeof v === "boolean") return v ? "1" : "0";
    if (typeof v === "object") {
      if (v instanceof Date) {
        return `'${v.toISOString().slice(0, 19).replace("T", " ")}'`;
      }
      // Prisma 偶发的 null 编码:{ prisma: { _null: true } }
      if ("prisma" in (v as Record<string, unknown>)) return "NULL";
      return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
    }
    // 走到这里 v 必为 string;数值型(LIMIT/OFFSET、数字列 id/code 等)不加引号,否则 MySQL 报 1064
    const s = v as string;
    if (/^-?\d+(\.\d+)?$/.test(s)) return s;
    return `'${s.replace(/'/g, "''")}'`;
  });
}

const createPrismaClient = () => {
  const client = new PrismaClient({
    adapter,
    log:
      env.NODE_ENV === "development"
        ? [
            { emit: "event", level: "query" },
            { emit: "stdout", level: "error" },
            { emit: "stdout", level: "warn" },
          ]
        : [{ emit: "stdout", level: "error" }],
  });

  // 开发模式:把 query 事件里的 ? 占位符替换为实际参数,打印可直接执行的 SQL
  if (env.NODE_ENV === "development") {
    client.$on("query", (e) => {
      console.log(`prisma:query ${inlineParams(e.query, e.params)}`);
    });
  }

  return client;
};

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;
