/**
 * 追加"子区域"菜单(知识库下,幂等,不重置现有菜单/授权)。
 * 用法:pnpm tsx scripts/seed-subarea-menu.ts
 */
import "dotenv/config";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client";

const url = new URL(process.env.DATABASE_URL!);
const adapter = new PrismaMariaDb({
  host: url.hostname,
  port: Number(url.port) || 3306,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  connectionLimit: 5,
});
const db = new PrismaClient({ adapter });

async function main() {
  const adminRole = await db.role.findUnique({ where: { code: "admin" } });
  if (!adminRole) throw new Error("admin 角色不存在,请先跑 seed.ts");

  const knowledge = await db.menu.findFirst({
    where: { name: "知识库", parentId: null },
  });
  if (!knowledge) throw new Error("知识库菜单不存在");

  // 按 path 幂等
  const subareaMenu =
    (await db.menu.findFirst({ where: { path: "/knowledge/subarea" } })) ??
    (await db.menu.create({
      data: {
        name: "子区域",
        path: "/knowledge/subarea",
        icon: "layers",
        sort: 7,
        parentId: knowledge.id,
      },
    }));

  await db.menuRole.createMany({
    data: [{ menuId: subareaMenu.id, roleId: adminRole.id }],
    skipDuplicates: true,
  });

  console.log("菜单就绪: 子区域(/knowledge/subarea, layers)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());