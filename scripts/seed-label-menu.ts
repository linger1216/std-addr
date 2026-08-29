import "dotenv/config";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client";

/**
 * 幂等地把「标签管理」菜单挂到 知识库 下并授权给 admin 角色。
 * 用途:已跑过 seed 的存量库,只想补新增菜单。
 * 用法: pnpm tsx scripts/seed-label-menu.ts
 */

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
  const knowledge = await db.menu.findFirst({ where: { name: "知识库" } });
  if (!knowledge) {
    throw new Error("找不到「知识库」父菜单,请先执行 pnpm db:seed");
  }

  let labelMenu = await db.menu.findFirst({
    where: { name: "地址要素", parentId: knowledge.id },
  });
  if (!labelMenu) {
    labelMenu = await db.menu.create({
      data: {
        name: "地址要素",
        path: "/knowledge/label",
        icon: "book-marked",
        sort: 6,
        parentId: knowledge.id,
      },
    });
    console.log(`已创建菜单:地址要素 (${labelMenu.id})`);
  } else {
    await db.menu.update({
      where: { id: labelMenu.id },
      data: { path: "/knowledge/label", icon: "book-marked", sort: 6 },
    });
    console.log(`菜单已存在,更新路径/图标:${labelMenu.id}`);
  }

  const adminRole = await db.role.findUnique({ where: { code: "admin" } });
  if (!adminRole) {
    throw new Error("找不到 admin 角色,请先执行 pnpm db:seed");
  }
  await db.menuRole.upsert({
    where: { menuId_roleId: { menuId: labelMenu.id, roleId: adminRole.id } },
    update: {},
    create: { menuId: labelMenu.id, roleId: adminRole.id },
  });
  console.log("已完成 admin 角色授权");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());