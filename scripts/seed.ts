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

const MENUS = [
  { name: "仪表盘", path: "/", icon: "dashboard", sort: 1, children: [] },
  { name: "标准地址库", path: "/std-addr", icon: "map", sort: 2, children: [] },
  {
    name: "知识库",
    path: null,
    icon: "trees",
    sort: 3,
    children: [
      { name: "村", path: "/knowledge/village", icon: "home", sort: 1 },
      { name: "小区", path: "/knowledge/community", icon: "building", sort: 2 },
      { name: "兴趣点", path: "/knowledge/poi", icon: "map-pin", sort: 3 },
      { name: "道路", path: "/knowledge/road", icon: "waypoints", sort: 4 },
    ],
  },
  { name: "地址模拟", path: "/addr-sim", icon: "waypoints", sort: 4, children: [] },
  {
    name: "系统管理",
    path: null,
    icon: "settings",
    sort: 5,
    children: [
      { name: "用户管理", path: "/users", icon: "users", sort: 1 },
      { name: "角色管理", path: "/roles", icon: "shield", sort: 2 },
      { name: "菜单管理", path: "/menus", icon: "menu", sort: 3 },
    ],
  },
];

async function main() {
  const adminRole = await db.role.upsert({
    where: { code: "admin" },
    update: {},
    create: {
      name: "管理员",
      code: "admin",
      description: "超级管理员, 拥有全部菜单",
    },
  });

  await db.user.upsert({
    where: { username: "admin" },
    update: { password: "123456", roleId: adminRole.id },
    create: {
      username: "admin",
      password: "123456",
      name: "admin",
      roleId: adminRole.id,
    },
  });

  await db.menu.deleteMany();
  for (const m of MENUS) {
    const parent = await db.menu.create({
      data: { name: m.name, path: m.path, icon: m.icon, sort: m.sort },
    });
    for (const c of m.children) {
      await db.menu.create({
        data: {
          name: c.name,
          path: c.path,
          icon: c.icon,
          sort: c.sort,
          parentId: parent.id,
        },
      });
    }
  }

  const allMenus = await db.menu.findMany();
  await db.menuRole.createMany({
    data: allMenus.map((m) => ({ menuId: m.id, roleId: adminRole.id })),
    skipDuplicates: true,
  });

  console.log("种子数据完成: admin / 123456");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
