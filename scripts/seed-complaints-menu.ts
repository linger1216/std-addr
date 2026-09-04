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
  // 1) 父菜单「地址场景」
  let parent = await db.menu.findFirst({ where: { name: "地址场景" } });
  if (!parent) {
    parent = await db.menu.create({
      data: { name: "地址场景", path: null, icon: "layers", sort: 6 },
    });
    console.log("创建父菜单: 地址场景");
  } else if (parent.icon !== "layers") {
    parent = await db.menu.update({ where: { id: parent.id }, data: { icon: "layers" } });
  }

  // 2) 两个独立子菜单:人房关联 / 重复诉件
  // 清理旧的单条「人房+重复诉件」(若存在)
  const legacy = await db.menu.findFirst({
    where: { name: "人房+重复诉件", parentId: parent.id },
  });
  if (legacy) {
    await db.menuRole.deleteMany({ where: { menuId: legacy.id } });
    await db.menu.delete({ where: { id: legacy.id } });
    console.log("移除旧子菜单: 人房+重复诉件");
  }

  const children = [
    { name: "人房关联", path: "/complaints/person-house", icon: "users", sort: 1 },
    { name: "重复诉件", path: "/complaints/duplicate", icon: "building", sort: 2 },
  ];
  const childIds: string[] = [parent.id];
  for (const c of children) {
    let row = await db.menu.findFirst({
      where: { name: c.name, parentId: parent.id },
    });
    if (!row) {
      row = await db.menu.create({
        data: {
          name: c.name,
          path: c.path,
          icon: c.icon,
          sort: c.sort,
          parentId: parent.id,
        },
      });
      console.log(`创建子菜单: ${c.name} -> ${c.path}`);
    } else if (row.path !== c.path || row.icon !== c.icon) {
      row = await db.menu.update({
        where: { id: row.id },
        data: { path: c.path, icon: c.icon },
      });
    }
    childIds.push(row.id);
  }

  // 3) 关联到全部角色(菜单按角色可见,确保登录用户能看到)
  const roles = await db.role.findMany({ select: { id: true } });
  let linked = 0;
  for (const role of roles) {
    for (const menuId of childIds) {
      await db.menuRole.upsert({
        where: { menuId_roleId: { menuId, roleId: role.id } },
        create: { menuId, roleId: role.id },
        update: {},
      });
    }
    linked++;
  }
  console.log(`已关联 ${linked} 个角色,菜单可见。`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
