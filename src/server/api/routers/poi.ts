import { z } from "zod";
import { Prisma } from "../../../../generated/prisma/client";

import {
  adminProcedure,
  createTRPCRouter,
} from "@/server/api/trpc";
import { optionalRegionIdSchema } from "@/lib/validators/community";
import { toErrorMessage, toRegionIdOrNull } from "@/lib/constants";
import { parseAliasEntries } from "@/lib/alias-entries";
import { parseAddressEntries } from "@/lib/format";

const statusSchema = z.union([z.literal(0), z.literal(1)]);

/**
 * alias 接收多种形态:字符串(单值)、字符串数组(多值)、JSON 字符串。
 * router 内部用 parseAliasEntries 归一,落库为字符串数组或 NULL。
 */
const aliasInputSchema = z
  .union([z.string(), z.array(z.string().trim().min(1).max(100))])
  .optional();

/**
 * address 接收多种形态:字符串数组(地址列表)、任意 JSON(兼容旧自由格式)。
 * 落库统一为数组或 NULL(旧对象数据由前端解析归一)。
 */
const addressInputSchema = z
  .union([
    z.array(z.string().trim().min(1).max(200)),
    z.string(),
    z.record(z.unknown()),
  ])
  .optional();

const poiCreateInput = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.string().trim().max(50).optional(),
  alias: aliasInputSchema,
  regionId: optionalRegionIdSchema,
  address: addressInputSchema,
  // geom: DDL 是 GEOMCOLLECTION,Prisma 不支持;暂不在 schema 里
  status: statusSchema.default(1),
});

const poiUpdateInput = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(100).optional(),
  type: z.string().trim().max(50).optional(),
  alias: aliasInputSchema,
  regionId: optionalRegionIdSchema,
  address: addressInputSchema,
  // geom: 同上
  status: statusSchema.optional(),
});

const poiImportRow = z.object({
  name: z.string().min(1).max(100),
  type: z.string().trim().max(50).optional(),
  alias: aliasInputSchema,
  regionId: optionalRegionIdSchema,
  address: addressInputSchema,
  status: statusSchema.optional(),
});

/**
 * alias(JSON 列)归一 —— 多值数组形式(对齐 community/village)。
 * undefined / 空数组 / 元素全空 → JsonNull;否则 → 字符串数组。
 */
function toNullableAlias(
  v: string | string[] | undefined,
): string[] | typeof Prisma.JsonNull {
  const list = parseAliasEntries(v);
  if (list.length === 0) return Prisma.JsonNull;
  return list;
}

/**
 * address(JSON 列)归一 —— 地址列表形式。
 * undefined / 空数组 → JsonNull;否则 → 字符串数组。
 * (旧自由对象数据兼容读入,写入统一为数组。)
 */
function toNullableAddress(
  v: string[] | string | Record<string, unknown> | undefined,
): string[] | typeof Prisma.JsonNull {
  const list = parseAddressEntries(v);
  if (list.length === 0) return Prisma.JsonNull;
  return list;
}

type PoiWithRegion = Prisma.PoiGetPayload<{
  include: { region: { select: { id: true; name: true } } };
}>;

/** 可排序列白名单 */
const poiSortFields = [
  "name",
  "type",
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
  type: z.string().trim().optional(),
  status: statusSchema.optional(),
  sort: z
    .array(
      z.object({
        id: z.enum(poiSortFields),
        desc: z.boolean().default(false),
      }),
    )
    .max(3)
    .optional(),
});

type FilterInput = Pick<
  z.infer<typeof listInput>,
  "q" | "regionId" | "type" | "status"
>;

function buildWhere(input: FilterInput): Prisma.PoiWhereInput {
  const where: Prisma.PoiWhereInput = {};
  if (input.q) {
    where.OR = [
      { name: { contains: input.q } },
      // alias 是 JSON 列,字符串匹配要用 string_contains
      { alias: { string_contains: input.q } },
    ];
  }
  if (input.type) where.type = { contains: input.type };
  if (input.regionId) where.regionId = input.regionId;
  if (input.status !== undefined) where.status = input.status;
  return where;
}

function buildOrderBy(
  sort: z.infer<typeof listInput>["sort"],
): Prisma.PoiOrderByWithRelationInput[] {
  const orderBy: Prisma.PoiOrderByWithRelationInput[] = [];
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

export const poiRouter = createTRPCRouter({
  /** 分页 + 搜索 + 类型/状态/区域 筛选 + 排序 */
  list: adminProcedure
    .input(listInput)
    .query(async ({ ctx, input }) => {
      const where = buildWhere(input);
      const orderBy = buildOrderBy(input.sort);

      const [total, rows] = await Promise.all([
        ctx.db.poi.count({ where }),
        ctx.db.poi.findMany({
          where,
          include: { region: { select: { id: true, name: true } } },
          orderBy,
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
        address: row.address,
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
          // alias 多值数组;空 → JsonNull
          alias: toNullableAlias(input.alias),
          // ""(未指定)/ undefined → null;合法 region id → 原样
          regionId: toRegionIdOrNull(input.regionId),
          // address 地址列表;空 → JsonNull
          address: toNullableAddress(input.address),
          // geom: DDL 是 GEOMCOLLECTION,Prisma 不支持写入;暂不写
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
      // alias 是 JSON 数组:undefined = 不动,空数组 → JsonNull,非空 → 数组
      if (input.alias !== undefined) data.alias = toNullableAlias(input.alias);
      if (input.regionId !== undefined) data.regionId = toRegionIdOrNull(input.regionId);
      // address 地址列表:undefined = 不动,空 → JsonNull
      if (input.address !== undefined) data.address = toNullableAddress(input.address);
      // geom: 同上,不在 update 中处理
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
        sort: listInput.shape.sort,
      }),
    )
    .query(async ({ ctx, input }) => {
      const where = buildWhere(input);
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
        orderBy: buildOrderBy(input.sort),
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
              alias: toNullableAlias(row.alias),
              // ""(未指定)/ undefined → null
              regionId: toRegionIdOrNull(row.regionId),
              address: toNullableAddress(row.address),
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