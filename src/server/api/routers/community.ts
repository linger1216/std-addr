import { z } from "zod";
import { Prisma } from "../../../../generated/prisma/client";

import {
  adminProcedure,
  createTRPCRouter,
} from "@/server/api/trpc";
import {
  communityCreateSchema,
  communityStatusSchema,
  communityUpdateSchema,
} from "@/lib/validators/community";
import { toErrorMessage } from "@/lib/constants";

/** 状态枚举复用共享 schema */
const statusSchema = communityStatusSchema;

/**
 * 把业务 JSON → Prisma 可写值。
 * undefined → 跳过(不写);null → JsonNull(清空);
 * 其余 → 类型安全的 InputJsonValue(避免 as 强转)。
 */
function toPrismaJson(
  v: unknown,
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (v === undefined) return undefined;
  if (v === null) return Prisma.JsonNull;
  return v;
}

const communityCreateInput = communityCreateSchema;
const communityUpdateInput = communityUpdateSchema;
const communityImportRow = z.object({
  name: z.string().min(1).max(100),
  alias: z.string().max(100).optional(),
  regionId: z.string().cuid().optional(),
  status: statusSchema.optional(),
});

type CommunityWithRegion = Prisma.CommunityGetPayload<{
  select: {
    id: true;
    name: true;
    alias: true;
    regionId: true;
    address: true;
    status: true;
    createdAt: true;
    updatedAt: true;
    region: { select: { id: true; name: true } };
  };
}>;

/** 可排序列白名单:防止任意字符串进 Prisma orderBy */
const communitySortFields = [
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
  /** 形如 [{ id:"name", desc:false }] —— 仅从白名单取值 */
  sort: z
    .array(
      z.object({
        id: z.enum(communitySortFields),
        desc: z.boolean().default(false),
      }),
    )
    .max(3)
    .optional(),
});

type FilterInput = Pick<z.infer<typeof listInput>, "q" | "regionId" | "status">;

/** 公共查询条件(列表 / 导出共用) */
function buildWhere(input: FilterInput): Prisma.CommunityWhereInput {
  const where: Prisma.CommunityWhereInput = {};
  if (input.q) {
    where.OR = [
      { name: { contains: input.q } },
      { alias: { contains: input.q } },
    ];
  }
  if (input.regionId) where.regionId = input.regionId;
  if (input.status !== undefined) where.status = input.status;
  return where;
}

/** 公共排序(列表 / 导出共用);regionName 排序用关联 region.name */
function buildOrderBy(
  sort: z.infer<typeof listInput>["sort"],
): Prisma.CommunityOrderByWithRelationInput[] {
  const orderBy: Prisma.CommunityOrderByWithRelationInput[] = [];
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

export const communityRouter = createTRPCRouter({
  /** 分页 + 搜索 + 状态/区域 筛选 + 排序 */
  list: adminProcedure
    .input(listInput)
    .query(async ({ ctx, input }) => {
      const where = buildWhere(input);
      const orderBy = buildOrderBy(input.sort);

      const [total, rows] = await Promise.all([
        ctx.db.community.count({ where }),
        ctx.db.community.findMany({
          where,
          select: {
            id: true,
            name: true,
            alias: true,
            regionId: true,
            address: true,
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

      const items = rows.map((row: CommunityWithRegion) => ({
        id: row.id,
        name: row.name,
        alias: row.alias,
        regionId: row.regionId,
        // Prisma JSON 列在 select 里推断成 InputJsonValue | null,与 zod jsonValueSchema 对齐
        address: row.address,
        // subarea: 列已从 DDL 删除,暂不返回(后续如需加回,补 select + 字段)
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
      ctx.db.community.count(),
      ctx.db.community.count({ where: { status: 1 } }),
      ctx.db.community.count({ where: { status: 0 } }),
      ctx.db.community.groupBy({
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

  /** 按 id 获取单条(含 region);用 select 只取需要的字段 */
  getById: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.community.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          name: true,
          alias: true,
          regionId: true,
          status: true,
          address: true,
          // geom: DDL 是 GEOMCOLLECTION,Prisma 用 Unsupported 类型绕过;
          // 这里不 select,要拿原始几何数据请走 raw SQL。
          createdAt: true,
          updatedAt: true,
          region: { select: { id: true, name: true } },
        },
      }),
    ),

  create: adminProcedure
    .input(communityCreateInput)
    .mutation(({ ctx, input }) => {
      return ctx.db.community.create({
        data: {
          name: input.name,
          alias: input.alias ?? null,
          regionId: input.regionId ?? null,
          // undefined → JsonNull(空 JSON 字段),null → JsonNull,其它 → 值
          address: toPrismaJson(input.address) ?? Prisma.JsonNull,
          // geom: Unsupported 类型,Prisma 不能直接写,统一 NULL(后续如要写空间数据走 raw SQL)
          status: input.status,
          createdAt: new Date(),
        },
      });
    }),

  update: adminProcedure
    .input(communityUpdateInput)
    .mutation(({ ctx, input }) => {
      const data: Prisma.CommunityUncheckedUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.alias !== undefined) data.alias = input.alias;
      if (input.regionId !== undefined) data.regionId = input.regionId;
      const address = toPrismaJson(input.address);
      if (address !== undefined) data.address = address;
      // geom: Unsupported 类型,不支持 update,需要时走 raw SQL
      if (input.status !== undefined) data.status = input.status;
      return ctx.db.community.update({
        where: { id: input.id },
        data,
      });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) =>
      ctx.db.community.delete({ where: { id: input.id } }),
    ),

  /** 批量删除 */
  deleteMany: adminProcedure
    .input(z.object({ ids: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.community.deleteMany({
        where: { id: { in: input.ids } },
      });
      return { count: result.count };
    }),

  /**
   * 导出:按给定筛选条件一次返回全量(不分页)。
   * ponytail: 供前端 Excel 导出用,避免前端循环翻页;
   * 只返回导出所需字段(不带 address/geom 大字段)。
   */
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
      const rows = await ctx.db.community.findMany({
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

  /** 导入(CSV / JSON 数组 -> 逐行 create);失败的行收集进 errors 不影响其它行 */
  import: adminProcedure
    .input(
      z.object({
        rows: z.array(communityImportRow).min(1).max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let created = 0;
      const errors: Array<{ index: number; message: string }> = [];

      for (let i = 0; i < input.rows.length; i++) {
        const row = input.rows[i]!;
        try {
          await ctx.db.community.create({
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
          errors.push({ index: i, message: toErrorMessage(err) });
        }
      }

      return { created, errors };
    }),
});