import { z } from "zod";

import {
  adminProcedure,
  createTRPCRouter,
} from "@/server/api/trpc";

const roleInput = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  description: z.string().nullable().optional(),
});

export const roleRouter = createTRPCRouter({
  list: adminProcedure.query(({ ctx }) =>
    ctx.db.role.findMany({
      include: { _count: { select: { users: true, menus: true } } },
      orderBy: { name: "asc" },
    }),
  ),

  /** 角色的菜单 id 列表(用于授权回显) */
  menuIds: adminProcedure
    .input(z.object({ roleId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.menuRole.findMany({
        where: { roleId: input.roleId },
        select: { menuId: true },
      });
      return rows.map((r) => r.menuId);
    }),

  create: adminProcedure
    .input(roleInput)
    .mutation(({ ctx, input }) =>
      ctx.db.role.create({
        data: {
          name: input.name,
          code: input.code,
          description: input.description ?? null,
        },
      }),
    ),

  update: adminProcedure
    .input(roleInput.extend({ id: z.string() }))
    .mutation(({ ctx, input }) =>
      ctx.db.role.update({
        where: { id: input.id },
        data: {
          name: input.name,
          code: input.code,
          description: input.description ?? null,
        },
      }),
    ),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) =>
      ctx.db.role.delete({ where: { id: input.id } }),
    ),

  /** 给角色设置菜单权限(全量覆盖) */
  setMenus: adminProcedure
    .input(z.object({ roleId: z.string(), menuIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.menuRole.deleteMany({ where: { roleId: input.roleId } });
      if (input.menuIds.length > 0) {
        await ctx.db.menuRole.createMany({
          data: input.menuIds.map((menuId) => ({
            roleId: input.roleId,
            menuId,
          })),
        });
      }
      return { ok: true };
    }),
});
