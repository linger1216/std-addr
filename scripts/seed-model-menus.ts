/**
 * 追加"系统设置"与"地址模型"菜单(幂等,不重置现有菜单/授权)。
 *
 * 与 seed.ts 不同:upsert + skipDuplicates,不会 deleteMany 重建全部菜单。
 * 用法:pnpm tsx scripts/seed-model-menus.ts
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

  // 1) 系统管理下追加"系统设置"(幂等:按 path 查,存在则跳过)
  const sysParent = await db.menu.findFirst({ where: { name: "系统管理", parentId: null } });
  if (!sysParent) throw new Error("系统管理菜单不存在");

  // 按 path 幂等:已存在则复用,不存在则创建
  const settingsMenu =
    (await db.menu.findFirst({ where: { path: "/settings" } })) ??
    (await db.menu.create({
      data: {
        name: "系统设置",
        path: "/settings",
        icon: "sliders-horizontal",
        sort: 4,
        parentId: sysParent.id,
      },
    }));

  // 2) 一级菜单"地址模型"
  const addrModelMenu =
    (await db.menu.findFirst({ where: { path: "/addr-model" } })) ??
    (await db.menu.create({
      data: {
        name: "地址模型",
        path: "/addr-model",
        icon: "brain-circuit",
        sort: 6,
        parentId: null,
      },
    }));

  // 3) admin 授权(幂等)
  await db.menuRole.createMany({
    data: [
      { menuId: settingsMenu.id, roleId: adminRole.id },
      { menuId: addrModelMenu.id, roleId: adminRole.id },
    ],
    skipDuplicates: true,
  });

  console.log(
    `菜单就绪: 系统设置(/settings, sliders-horizontal), 地址模型(/addr-model, brain-circuit)`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());