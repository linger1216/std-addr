import { z } from "zod";
import { Prisma } from "../../../../generated/prisma/client";

import {
  adminProcedure,
  createTRPCRouter,
} from "@/server/api/trpc";

const statusSchema = z.union([z.literal(0), z.literal(1)]);

/** JSON 字段:address / geom 接收任意可序列化值,服务端不做结构校验 */
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

const poiCreateInput = z.object({
  name: z.string().min(1).max(100),
  type: z.string().max(50).optional(),
  alias: z.string().max(100).optional(),
  regionId: z.string().cuid().optional(),
  address: jsonValueSchema,
  geom: jsonValueSchema,
  status: statusSchema.default(1),
});

const poiUpdateInput = z.object({
  id: z.string(),
  name: z.string().min(1).max(100).optional(),
  type: z.string().max(50).optional(),
  alias: z.string().max(100).optional(),
  regionId: z.string().cuid().optional(),
  address: jsonValueSchema,
  geom: jsonValueSchema,
  status: statusSchema.optional(),
});

const poiImportRow = z.object({
  name: z.string().min(1).max(100),
  type: z.string().max(50).optional(),
  alias: z.string().max(100).optional(),
  regionId: z.string().cuid().optional(),
  status: statusSchema.optional(),
});

type PoiWithRegion = Prisma.PoiGetPayload<{
  include: { region: { select: { id: true; name: true } } };
}>;

export const poiRouter = createTRPCRouter({
  /** 分页 + 搜索 + 类型/状态/区域 筛选 */
  list: adminProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(200).default(20),
        q: z.string().trim().optional(),
        regionId: z.string().optional(),
        type: z.string().trim().optional(),
        status: statusSchema.optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.PoiWhereInput = {};
      if (input.q) {
        where.OR = [
          { name: { contains: input.q } },
          { alias: { contains: input.q } },
        ];
      }
      if (input.type) where.type = { contains: input.type };
      if (input.regionId) where.regionId = input.regionId;
      if (input.status !== undefined) where.status = input.status;

      const [total, rows] = await Promise.all([
        ctx.db.poi.count({ where }),
        ctx.db.poi.findMany({
          where,
          include: { region: { select: { id: true, name: true } } },
          orderBy: [{ status: "desc" }, { createdAt: "desc" }],
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
        }),
      ]);

      const items = rows.map((row: PoiWithRegion) => ({
        id: row.id,
        name: row.name,
        type: row.type,
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
      ctx.db.poi.count(),
      ctx.db.poi.count({ where: { status: 1 } }),
      ctx.db.poi.count({ where: { status: 0 } }),
      ctx.db.poi.findMany({
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
      ctx.db.poi.findUnique({
        where: { id: input.id },
        include: { region: { select: { id: true, name: true } } },
      }),
    ),

  create: adminProcedure
    .input(poiCreateInput)
    .mutation(({ ctx, input }) =>
      ctx.db.poi.create({
        data: {
          name: input.name,
          type: input.type ?? null,
          alias: input.alias ?? null,
          regionId: input.regionId ?? null,
          address:
            input.address === undefined || input.address === null
              ? Prisma.JsonNull
              : (input.address as Prisma.InputJsonValue),
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
    .input(poiUpdateInput)
    .mutation(({ ctx, input }) => {
      const data: Prisma.PoiUncheckedUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.type !== undefined) data.type = input.type;
      if (input.alias !== undefined) data.alias = input.alias;
      if (input.regionId !== undefined) data.regionId = input.regionId;
      if (input.address !== undefined) {
        data.address =
          input.address === null
            ? Prisma.JsonNull
            : (input.address as Prisma.InputJsonValue);
      }
      if (input.geom !== undefined) {
        data.geom =
          input.geom === null
            ? Prisma.JsonNull
            : (input.geom as Prisma.InputJsonValue);
      }
      if (input.status !== undefined) data.status = input.status;
      return ctx.db.poi.update({
        where: { id: input.id },
        data,
      });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) =>
      ctx.db.poi.delete({ where: { id: input.id } }),
    ),

  /** 批量删除 */
  deleteMany: adminProcedure
    .input(z.object({ ids: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.poi.deleteMany({
        where: { id: { in: input.ids } },
      });
      return { count: result.count };
    }),

  /** 导出:一次返回全量(前端 Excel 导出用) */
  exportAll: adminProcedure
    .input(
      z.object({
        q: z.string().trim().optional(),
        regionId: z.string().optional(),
        status: statusSchema.optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.PoiWhereInput = {};
      if (input.q) {
        where.OR = [
          { name: { contains: input.q } },
          { alias: { contains: input.q } },
        ];
      }
      if (input.regionId) where.regionId = input.regionId;
      if (input.status !== undefined) where.status = input.status;

      const rows = await ctx.db.poi.findMany({
        where,
        select: {
          id: true,
          name: true,
          type: true,
          alias: true,
          regionId: true,
          status: true,
          createdAt: true,
          region: { select: { name: true } },
        },
        orderBy: [{ status: "desc" }, { createdAt: "desc" }],
      });
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        alias: row.alias,
        regionId: row.regionId,
        regionName: row.region?.name ?? null,
        status: row.status,
        createdAt: row.createdAt,
      }));
    }),

  /** 导入(CSV / JSON 数组 -> 逐行 create);失败的行收集进 errors 不影响其它行 */
  import: adminProcedure
    .input(
      z.object({
        rows: z.array(poiImportRow).min(1).max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let created = 0;
      const errors: Array<{ index: number; message: string }> = [];

      for (let i = 0; i < input.rows.length; i++) {
        const row = input.rows[i]!;
        try {
          await ctx.db.poi.create({
            data: {
              name: row.name,
              type: row.type ?? null,
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