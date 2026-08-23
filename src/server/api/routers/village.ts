import { z } from "zod";
import { Prisma } from "../../../../generated/prisma/client";

import {
  adminProcedure,
  createTRPCRouter,
} from "@/server/api/trpc";

const statusSchema = z.union([z.literal(0), z.literal(1)]);

/** JSON 字段:geom 接收任意可序列化值,服务端不做结构校验 */
const jsonValueSchema = z
  .union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(z.unknown()),
    z.record(z.unknown()),
  ])
  .optional();

const villageCreateInput = z.object({
  name: z.string().min(1).max(100),
  alias: z.string().max(100).optional(),
  regionId: z.string().cuid().optional(),
  geom: jsonValueSchema,
  status: statusSchema.default(1),
});

const villageUpdateInput = z.object({
  id: z.string(),
  name: z.string().min(1).max(100).optional(),
  alias: z.string().max(100).optional(),
  regionId: z.string().cuid().optional(),
  geom: jsonValueSchema,
  status: statusSchema.optional(),
});

const villageImportRow = z.object({
  name: z.string().min(1).max(100),
  alias: z.string().max(100).optional(),
  regionId: z.string().cuid().optional(),
  status: statusSchema.optional(),
});

type VillageWithRegion = Prisma.VillageGetPayload<{
  include: { region: { select: { id: true; name: true } } };
}>;

export const villageRouter = createTRPCRouter({
  /** 分页 + 搜索 + 状态/区域 筛选 */
  list: adminProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(200).default(20),
        q: z.string().trim().optional(),
        regionId: z.string().optional(),
        status: statusSchema.optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.VillageWhereInput = {};
      if (input.q) {
        where.OR = [
          { name: { contains: input.q } },
          { alias: { contains: input.q } },
        ];
      }
      if (input.regionId) where.regionId = input.regionId;
      if (input.status !== undefined) where.status = input.status;

      const [total, rows] = await Promise.all([
        ctx.db.village.count({ where }),
        ctx.db.village.findMany({
          where,
          include: { region: { select: { id: true, name: true } } },
          orderBy: [{ status: "desc" }, { createdAt: "desc" }],
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
        }),
      ]);

      const items = rows.map((row: VillageWithRegion) => ({
        id: row.id,
        name: row.name,
        alias: row.alias,
        regionId: row.regionId,
        regionName: row.region?.name ?? null,
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

  /** 统计: 总数 / 启用 / 禁用 / 关联区域数 */
  stats: adminProcedure.query(async ({ ctx }) => {
    const [total, enabled, disabled, regionAgg] = await Promise.all([
      ctx.db.village.count(),
      ctx.db.village.count({ where: { status: 1 } }),
      ctx.db.village.count({ where: { status: 0 } }),
      ctx.db.village.findMany({
        where: { regionId: { not: null } },
        select: { regionId: true },
        distinct: ["regionId"],
      }),
    ]);

    return {
      total,
      enabled,
      disabled,
      regionCount: regionAgg.length,
    };
  }),

  /** 全部区域(id + name),用于前端下拉 */
  regions: adminProcedure.query(({ ctx }) =>
    ctx.db.region.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ),

  /** 按 id 获取单条(含 region) */
  getById: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.village.findUnique({
        where: { id: input.id },
        include: { region: { select: { id: true, name: true } } },
      }),
    ),

  create: adminProcedure
    .input(villageCreateInput)
    .mutation(({ ctx, input }) =>
      ctx.db.village.create({
        data: {
          name: input.name,
          alias: input.alias ?? null,
          regionId: input.regionId ?? null,
          geom:
            input.geom === undefined || input.geom === null
              ? Prisma.JsonNull
              : (input.geom as Prisma.InputJsonValue),
          status: input.status,
          createdAt: new Date(),
        },
      }),
    ),

  update: adminProcedure
    .input(villageUpdateInput)
    .mutation(({ ctx, input }) => {
      const data: Prisma.VillageUncheckedUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.alias !== undefined) data.alias = input.alias;
      if (input.regionId !== undefined) data.regionId = input.regionId;
      if (input.geom !== undefined) {
        data.geom =
          input.geom === null
            ? Prisma.JsonNull
            : (input.geom as Prisma.InputJsonValue);
      }
      if (input.status !== undefined) data.status = input.status;
      return ctx.db.village.update({
        where: { id: input.id },
        data,
      });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) =>
      ctx.db.village.delete({ where: { id: input.id } }),
    ),

  /** 批量删除 */
  deleteMany: adminProcedure
    .input(z.object({ ids: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.village.deleteMany({
        where: { id: { in: input.ids } },
      });
      return { count: result.count };
    }),

  /** 导入(CSV / JSON 数组 -> 逐行 create);失败的行收集进 errors 不影响其它行 */
  import: adminProcedure
    .input(
      z.object({
        rows: z.array(villageImportRow).min(1).max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let created = 0;
      const errors: Array<{ index: number; message: string }> = [];

      for (let i = 0; i < input.rows.length; i++) {
        const row = input.rows[i]!;
        try {
          await ctx.db.village.create({
            data: {
              name: row.name,
              alias: row.alias ?? null,
              regionId: row.regionId ?? null,
              status: row.status ?? 1,
              createdAt: new Date(),
            },
          });
          created++;
        } catch (err) {
          errors.push({
            index: i,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return { created, errors };
    }),
});