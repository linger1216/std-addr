import { z } from "zod";
import { Prisma } from "../../../../generated/prisma/client";

import {
  adminProcedure,
  createTRPCRouter,
} from "@/server/api/trpc";
import { communityStatusSchema, optionalRegionIdSchema } from "@/lib/validators/community";
import { toErrorMessage, toRegionIdOrNull } from "@/lib/constants";
import { parseAliasEntries } from "@/lib/alias-entries";

const statusSchema = communityStatusSchema;

/**
 * alias 接收多种形态:字符串(单值)、字符串数组(多值)、JSON 字符串。
 * router 内部用 parseAliasEntries 归一,最终落库为字符串数组或 NULL。
 */
const aliasInputSchema = z
  .union([z.string(), z.array(z.string().trim().min(1).max(100))])
  .optional();

const villageCreateInput = z.object({
  name: z.string().trim().min(1).max(100),
  alias: aliasInputSchema,
  regionId: optionalRegionIdSchema,
  // geom: DDL 是 GEOMCOLLECTION,Prisma 不支持;暂不在 schema
  status: statusSchema.default(1),
});

const villageUpdateInput = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(100).optional(),
  alias: aliasInputSchema,
  regionId: optionalRegionIdSchema,
  // geom: 同上
  status: statusSchema.optional(),
});

const villageImportRow = z.object({
  name: z.string().min(1).max(100),
  alias: aliasInputSchema,
  regionId: optionalRegionIdSchema,
  status: statusSchema.optional(),
});

/**
 * 别名(JSON 列)归一 —— 多值数组形式。
 *   - undefined / 空数组 / 元素全空 → JsonNull(等价 NULL,清空列)
 *   - 否则 → 字符串数组(Prisma 序列化为 JSON 数组)
 *
 * 兼容:旧客户端若传单个字符串/JSON 字符串,parseAliasEntries 会展平成数组;
 * 兼容历史脏数据:老 schema(String 列)可能存为单字符串或字符串数组,都能解析。
 */
function toNullableAlias(
  v: string | string[] | undefined,
): string[] | typeof Prisma.JsonNull {
  const list = parseAliasEntries(v);
  if (list.length === 0) return Prisma.JsonNull;
  return list;
}

type VillageWithRegion = Prisma.VillageGetPayload<{
  select: {
    id: true;
    name: true;
    alias: true;
    regionId: true;
    status: true;
    createdAt: true;
    updatedAt: true;
    region: { select: { id: true; name: true } };
  };
}>;

/** 可排序列白名单 */
const villageSortFields = [
  "name",
  "alias",
  "regionName",
  "status",
  "createdAt",
] as const;

const listInput = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(20),
  q: z.string().trim().optional(),
  regionId: z.string().optional(),
  status: statusSchema.optional(),
  sort: z
    .array(
      z.object({
        id: z.enum(villageSortFields),
        desc: z.boolean().default(false),
      }),
    )
    .max(3)
    .optional(),
});

type FilterInput = Pick<z.infer<typeof listInput>, "q" | "regionId" | "status">;

function buildWhere(input: FilterInput): Prisma.VillageWhereInput {
  const where: Prisma.VillageWhereInput = {};
  if (input.q) {
    where.OR = [
      { name: { contains: input.q } },
      // alias 是 JSON 列,字符串匹配要用 string_contains(不是 contains)
      { alias: { string_contains: input.q } },
    ];
  }
  if (input.regionId) where.regionId = input.regionId;
  if (input.status !== undefined) where.status = input.status;
  return where;
}

function buildOrderBy(
  sort: z.infer<typeof listInput>["sort"],
): Prisma.VillageOrderByWithRelationInput[] {
  const orderBy: Prisma.VillageOrderByWithRelationInput[] = [];
  if (sort && sort.length > 0) {
    for (const s of sort) {
      const dir = s.desc ? "desc" : "asc";
      if (s.id === "regionName") {
        orderBy.push({ region: { name: dir } });
      } else {
        orderBy.push({ [s.id]: dir });
      }
    }
  } else {
    orderBy.push({ status: "desc" }, { createdAt: "desc" });
  }
  return orderBy;
}

export const villageRouter = createTRPCRouter({
  /** 分页 + 搜索 + 状态/区域 筛选 + 排序 */
  list: adminProcedure
    .input(listInput)
    .query(async ({ ctx, input }) => {
      const where = buildWhere(input);
      const orderBy = buildOrderBy(input.sort);

      const [total, rows] = await Promise.all([
        ctx.db.village.count({ where }),
        ctx.db.village.findMany({
          where,
          select: {
            id: true,
            name: true,
            alias: true,
            regionId: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            region: { select: { id: true, name: true } },
          },
          orderBy,
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
      ctx.db.village.groupBy({
        by: ["regionId"],
        where: { regionId: { not: null } },
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

  /** 按 id 获取单条(含 region);select 瘦身 */
  getById: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.village.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          name: true,
          alias: true,
          regionId: true,
          status: true,
          // geom: DDL 是 GEOMCOLLECTION,Prisma 不支持 select;要拿原始几何走 raw SQL
          createdAt: true,
          updatedAt: true,
          region: { select: { id: true, name: true } },
        },
      }),
    ),

  create: adminProcedure
    .input(villageCreateInput)
    .mutation(({ ctx, input }) =>
      ctx.db.village.create({
        data: {
          name: input.name,
          // alias 多值数组;空 → JsonNull,非空 → 数组(Prisma 序列化为 JSON 数组)
          alias: toNullableAlias(input.alias),
          // ""(未指定)/ undefined → null;合法 region id → 原样
          regionId: toRegionIdOrNull(input.regionId),
          // geom: Unsupported 类型,Prisma 不能直接写;需要时走 raw SQL
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
      // alias 是 JSON 数组:undefined = 不动,空数组 → JsonNull,非空 → 数组
      if (input.alias !== undefined) data.alias = toNullableAlias(input.alias);
      if (input.regionId !== undefined) data.regionId = toRegionIdOrNull(input.regionId);
      // geom: Unsupported 类型,不支持 update,需要时走 raw SQL
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

  /** 导出:一次返回全量(前端 Excel 导出用) */
  exportAll: adminProcedure
    .input(
      z.object({
        q: z.string().trim().optional(),
        regionId: z.string().optional(),
        status: statusSchema.optional(),
        sort: listInput.shape.sort,
      }),
    )
    .query(async ({ ctx, input }) => {
      const where = buildWhere(input);
      const rows = await ctx.db.village.findMany({
        where,
        select: {
          id: true,
          name: true,
          alias: true,
          regionId: true,
          status: true,
          createdAt: true,
          region: { select: { name: true } },
        },
        orderBy: buildOrderBy(input.sort),
      });
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        alias: row.alias,
        regionId: row.regionId,
        regionName: row.region?.name ?? null,
        status: row.status,
        createdAt: row.createdAt,
      }));
    }),

  /** 导入(逐行 create;失败收集进 errors,不影响其它行) */
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
              // alias 多值数组;空 → JsonNull,非空 → 数组
              alias: toNullableAlias(row.alias),
              // ""(未指定)/ undefined → null
              regionId: toRegionIdOrNull(row.regionId),
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