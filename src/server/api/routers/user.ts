import { z } from "zod";

import {
  adminProcedure,
  createTRPCRouter,
  protectedProcedure,
} from "@/server/api/trpc";

const userCreateInput = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  name: z.string().optional(),
  roleId: z.string().nullable().optional(),
});

const userUpdateInput = z.object({
  id: z.string(),
  name: z.string().optional(),
  password: z.string().optional(),
  roleId: z.string().nullable().optional(),
});

export const userRouter = createTRPCRouter({
  /** 当前登录用户信息 */
  me: protectedProcedure.query(({ ctx }) => ctx.session.user),

  list: adminProcedure.query(({ ctx }) =>
    ctx.db.user.findMany({
      include: { role: true },
      orderBy: { username: "asc" },
    }),
  ),

  create: adminProcedure
    .input(userCreateInput)
    .mutation(({ ctx, input }) =>
      ctx.db.user.create({
        data: {
          username: input.username,
          password: input.password,
          name: input.name ?? null,
          roleId: input.roleId,
        },
      }),
    ),

  update: adminProcedure
    .input(userUpdateInput)
    .mutation(({ ctx, input }) =>
      ctx.db.user.update({
        where: { id: input.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.password ? { password: input.password } : {}),
          ...(input.roleId !== undefined ? { roleId: input.roleId } : {}),
        },
      }),
    ),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) =>
      ctx.db.user.delete({ where: { id: input.id } }),
    ),
});
