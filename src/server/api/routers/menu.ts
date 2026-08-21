import { z } from "zod";

import type { PrismaClient } from "../../../../generated/prisma/client";
import {
  adminProcedure,
  createTRPCRouter,
  protectedProcedure,
} from "@/server/api/trpc";

export type MenuNode = {
  id: string;
  name: string;
  path: string | null;
  icon: string | null;
  children: MenuNode[];
};

const menuInput = z.object({
  name: z.string().min(1),
  path: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  sort: z.number().int().default(0),
  visible: z.boolean().default(true),
  parentId: z.string().nullable().optional(),
});

export const menuRouter = createTRPCRouter({
  /**
   * 返回当前登录用户角色可见的菜单树(按 sort 排序, 已过滤 hidden).
   */
  getTree: protectedProcedure.query(async ({ ctx }): Promise<MenuNode[]> => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
      include: { role: { include: { menus: { include: { menu: true } } } } },
    });

    const roleMenus = user?.role?.menus.map((m) => m.menu) ?? [];
    return buildTree(roleMenus);
  }),

  /** 全部菜单(平铺, 用于管理页) */
  listAll: adminProcedure.query(({ ctx }) =>
    ctx.db.menu.findMany({
      orderBy: [{ sort: "asc" }, { name: "asc" }],
    }),
  ),

  create: adminProcedure.input(menuInput).mutation(({ ctx, input }) =>
    ctx.db.menu.create({
      data: {
        name: input.name,
        path: input.path ?? null,
        icon: input.icon ?? null,
        sort: input.sort,
        visible: input.visible,
        parentId: input.parentId,
      },
    }),
  ),

  update: adminProcedure
    .input(menuInput.extend({ id: z.string() }))
    .mutation(({ ctx, input }) =>
      ctx.db.menu.update({
        where: { id: input.id },
        data: {
          name: input.name,
          path: input.path ?? null,
          icon: input.icon ?? null,
          sort: input.sort,
          visible: input.visible,
          parentId: input.parentId,
        },
      }),
    ),

  /** 删除菜单及其子树(menuRole 由 DB 级联删除) */
  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await deleteMenuTree(ctx.db, input.id);
      return { ok: true };
    }),
});

type FlatMenu = {
  id: string;
  parentId: string | null;
  name: string;
  path: string | null;
  icon: string | null;
  sort: number;
  visible: boolean;
};

function buildTree(menus: FlatMenu[]): MenuNode[] {
  const visible = menus.filter((m) => m.visible);
  const byParent = new Map<string | null, FlatMenu[]>();
  for (const m of visible) {
    const key = m.parentId ?? null;
    const list = byParent.get(key) ?? [];
    list.push(m);
    byParent.set(key, list);
  }

  const walk = (parentId: string | null): MenuNode[] =>
    (byParent.get(parentId) ?? [])
      .sort((a, b) => a.sort - b.sort)
      .map((m) => ({
        id: m.id,
        name: m.name,
        path: m.path,
        icon: m.icon,
        children: walk(m.id),
      }));

  return walk(null);
}

async function deleteMenuTree(db: PrismaClient, id: string) {
  const children = await db.menu.findMany({
    where: { parentId: id },
    select: { id: true },
  });
  for (const c of children) {
    await deleteMenuTree(db, c.id);
  }
  await db.menu.delete({ where: { id } });
}
