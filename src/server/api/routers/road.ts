import { z } from "zod";
import type { Prisma } from "../../../../generated/prisma/client";

import {
  adminProcedure,
  createTRPCRouter,
} from "@/server/api/trpc";
import { toErrorMessage } from "@/lib/constants";

const statusSchema = z.union([z.literal(0), z.literal(1)]);

const roadCreateInput = z.object({
  road: z.string().trim().min(1).max(100),
  status: statusSchema.default(1),
});

const roadUpdateInput = z.object({
  id: z.string(),
  road: z.string().trim().min(1).max(100).optional(),
  status: statusSchema.optional(),
});

const roadImportRow = z.object({
  road: z.string().trim().min(1).max(100),
  status: statusSchema.optional(),
});

/** 可排序列白名单 */
const roadSortFields = ["road", "status", "createdAt"] as const;

const listInput = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(20),
  q: z.string().trim().optional(),
  status: statusSchema.optional(),
  sort: z
    .array(
      z.object({
        id: z.enum(roadSortFields),
        desc: z.boolean().default(false),
      }),
    )
    .max(3)
    .optional(),
});

type FilterInput = Pick<z.infer<typeof listInput>, "q" | "status">;

function buildWhere(input: FilterInput): Prisma.RoadWhereInput {
  const where: Prisma.RoadWhereInput = {};
  if (input.q) where.road = { contains: input.q };
  if (input.status !== undefined) where.status = input.status;
  return where;
}

function buildOrderBy(
  sort: z.infer<typeof listInput>["sort"],
): Prisma.RoadOrderByWithRelationInput[] {
  if (sort && sort.length > 0) {
    return sort.map((s) => ({ [s.id]: s.desc ? "desc" : "asc" }));
  }
  return [{ status: "desc" }, { createdAt: "desc" }];
}

export const roadRouter = createTRPCRouter({
  /** 分页 + 搜索 + 状态筛选 + 排序 */
  list: adminProcedure
    .input(listInput)
    .query(async ({ ctx, input }) => {
      const where = buildWhere(input);
      const orderBy = buildOrderBy(input.sort);

      const [total, rows] = await Promise.all([
        ctx.db.road.count({ where }),
        ctx.db.road.findMany({
          where,
          orderBy,
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
        }),
      ]);

      const items = rows.map((row) => ({
        id: row.id,
        road: row.road,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));

      return {
        items,
        total,
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  /** 统计: 总数 / 启用 / 禁用 */
  stats: adminProcedure.query(async ({ ctx }) => {
    const [total, enabled, disabled] = await Promise.all([
      ctx.db.road.count(),
      ctx.db.road.count({ where: { status: 1 } }),
      ctx.db.road.count({ where: { status: 0 } }),
    ]);

    return { total, enabled, disabled };
  }),

  /** 按 id 获取单条 */
  getById: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.road.findUnique({ where: { id: input.id } }),
    ),

  create: adminProcedure
    .input(roadCreateInput)
    .mutation(({ ctx, input }) =>
      ctx.db.road.create({
        data: {
          road: input.road,
          status: input.status,
          createdAt: new Date(),
        },
      }),
    ),

  update: adminProcedure
    .input(roadUpdateInput)
    .mutation(({ ctx, input }) => {
      const data: Prisma.RoadUncheckedUpdateInput = {};
      if (input.road !== undefined) data.road = input.road;
      if (input.status !== undefined) data.status = input.status;
      return ctx.db.road.update({
        where: { id: input.id },
        data,
      });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) =>
      ctx.db.road.delete({ where: { id: input.id } }),
    ),

  /** 批量删除 */
  deleteMany: adminProcedure
    .input(z.object({ ids: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.road.deleteMany({
        where: { id: { in: input.ids } },
      });
      return { count: result.count };
    }),

  /** 导出:一次返回全量(前端 Excel 导出用) */
  exportAll: adminProcedure
    .input(
      z.object({
        q: z.string().trim().optional(),
        status: statusSchema.optional(),
        sort: listInput.shape.sort,
      }),
    )
    .query(async ({ ctx, input }) => {
      const where = buildWhere(input);
      const rows = await ctx.db.road.findMany({
        where,
        select: {
          id: true,
          road: true,
          status: true,
          createdAt: true,
        },
        orderBy: buildOrderBy(input.sort),
      });
      return rows.map((row) => ({
        id: row.id,
        road: row.road,
        status: row.status,
        createdAt: row.createdAt,
      }));
    }),

  /** 导入(CSV / JSON 数组 -> 逐行 create);失败的行收集进 errors 不影响其它行 */
  import: adminProcedure
    .input(
      z.object({
        rows: z.array(roadImportRow).min(1).max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let created = 0;
      const errors: Array<{ index: number; message: string }> = [];

      for (let i = 0; i < input.rows.length; i++) {
        const row = input.rows[i]!;
        try {
          await ctx.db.road.create({
            data: {
              road: row.road,
              status: row.status ?? 1,
              createdAt: new Date(),
            },
          });
          created++;
        } catch (err) {
          errors.push({ index: i, message: toErrorMessage(err) });
        }
      }

      return { created, errors };
    }),
});