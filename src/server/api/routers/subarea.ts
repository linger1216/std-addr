import { z } from "zod";
import { Prisma, type PrismaClient } from "../../../../generated/prisma/client";

import {
  adminProcedure,
  createTRPCRouter,
} from "@/server/api/trpc";
import {
  aliasInputSchema,
  optionalRegionIdSchema,
  subareaCreateSchema,
  subareaStatusSchema,
  subareaUpdateSchema,
} from "@/lib/validators/subarea";
import { toErrorMessage, toRegionIdOrNull } from "@/lib/constants";
import { parseAliasEntries } from "@/lib/alias-entries";

const statusSchema = subareaStatusSchema;

/** 业务 JSON → Prisma 可写值(undefined 跳过/null 清空) */
function toPrismaJson(
  v: unknown,
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (v === undefined) return undefined;
  if (v === null) return Prisma.JsonNull;
  return v;
}

/** 别名(JSON 列)归一 —— 多值数组形态;空 → JsonNull */
function toNullableAlias(
  v: string | string[] | undefined,
): string[] | typeof Prisma.JsonNull {
  const list = parseAliasEntries(v);
  if (list.length === 0) return Prisma.JsonNull;
  return list;
}

const subareaCreateInput = subareaCreateSchema;
const subareaUpdateInput = subareaUpdateSchema;

const subareaImportRow = z.object({
  name: z.string().min(1).max(100),
  alias: aliasInputSchema,
  // 空串 = 未指定,create 时归一为 null
  regionId: optionalRegionIdSchema,
  entityType: z.string().trim().max(50).optional(),
  entityId: z.string().trim().max(50).optional(),
  status: statusSchema.optional(),
});

type SubareaWithRegion = Prisma.SubareaGetPayload<{
  select: {
    id: true;
    name: true;
    alias: true;
    regionId: true;
    entityType: true;
    entityId: true;
    address: true;
    property: true;
    status: true;
    createdAt: true;
    updatedAt: true;
    region: { select: { id: true; name: true } };
  };
}>;

/**
 * 子区域关联的实体类型:entity_id 实际存的是 小区(community)/村(village)/POI 的 ID。
 * (road 暂不纳入:road 表无子区域挂载入口,子区域管理里不出现在下拉)
 */
export const SUBAREA_ENTITY_TYPES = ["community", "village", "poi"] as const;
export type SubareaEntityType = (typeof SUBAREA_ENTITY_TYPES)[number];

/** 实体类型 → 中文(表格/详情展示) */
export const SUBAREA_ENTITY_LABELS: Record<SubareaEntityType, string> = {
  community: "小区",
  village: "村",
  poi: "POI",
};

type DbForEntity = Pick<
  PrismaClient,
  "community" | "village" | "poi"
>;

/** 解析一串子区域的 关联实体名(按类型分组批量查,减少 N+1) */
async function resolveEntityNames(
  db: DbForEntity,
  rows: Array<{ entityType: string | null; entityId: string | null }>,
): Promise<Map<string, string | null>> {
  const byType = new Map<SubareaEntityType, Set<string>>();
  for (const r of rows) {
    if (!r.entityType || !r.entityId) continue;
    if (!(SUBAREA_ENTITY_TYPES as readonly string[]).includes(r.entityType)) {
      continue;
    }
    const t = r.entityType as SubareaEntityType;
    const ids = byType.get(t) ?? new Set<string>();
    ids.add(r.entityId);
    byType.set(t, ids);
  }

  const nameById = new Map<string, string | null>();
  const queries: Promise<unknown>[] = [];
  for (const type of SUBAREA_ENTITY_TYPES) {
    const ids = byType.get(type);
    if (!ids || ids.size === 0) continue;
    const list = [...ids];
    const q =
      type === "community"
        ? db.community.findMany({
            where: { id: { in: list } },
            select: { id: true, name: true },
          })
        : type === "village"
          ? db.village.findMany({
              where: { id: { in: list } },
              select: { id: true, name: true },
            })
          : db.poi.findMany({
              where: { id: { in: list } },
              select: { id: true, name: true },
            });
    queries.push(
      q.then((rowsFound) => {
        for (const row of rowsFound) {
          nameById.set(`${type}:${row.id}`, row.name);
        }
      }),
    );
  }
  await Promise.all(queries);
  return nameById;
}

/** entityType/entityId → 单条实体名(供 getById 返回展示) */
async function resolveEntityName(
  db: DbForEntity,
  entityType: string | null | undefined,
  entityId: string | null | undefined,
): Promise<string | null> {
  if (!entityType || !entityId) return null;
  if (!(SUBAREA_ENTITY_TYPES as readonly string[]).includes(entityType)) {
    return null;
  }
  const type = entityType as SubareaEntityType;
  const row =
    type === "community"
      ? await db.community.findUnique({
          where: { id: entityId },
          select: { name: true },
        })
      : type === "village"
        ? await db.village.findUnique({
            where: { id: entityId },
            select: { name: true },
          })
        : await db.poi.findUnique({
            where: { id: entityId },
            select: { name: true },
          });
  return row?.name ?? null;
}

const subareaSortFields = [
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
        id: z.enum(subareaSortFields),
        desc: z.boolean().default(false),
      }),
    )
    .max(3)
    .optional(),
});

type FilterInput = Pick<z.infer<typeof listInput>, "q" | "regionId" | "status">;

function buildWhere(input: FilterInput): Prisma.SubareaWhereInput {
  const where: Prisma.SubareaWhereInput = {};
  if (input.q) {
    where.OR = [
      { name: { contains: input.q } },
      { alias: { string_contains: input.q } },
    ];
  }
  if (input.regionId) where.regionId = input.regionId;
  if (input.status !== undefined) where.status = input.status;
  return where;
}

function buildOrderBy(
  sort: z.infer<typeof listInput>["sort"],
): Prisma.SubareaOrderByWithRelationInput[] {
  const orderBy: Prisma.SubareaOrderByWithRelationInput[] = [];
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

/** 实体类型/ID 归一:空白 → null(前端"未指定"语义);undefined 保持不动 */
function toEntityOrNull(v: string | null | undefined): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = v.trim();
  return s === "" ? null : s;
}

export const subareaRouter = createTRPCRouter({
  /** 分页 + 搜索 + 状态/区域 筛选 + 排序 */
  list: adminProcedure
    .input(listInput)
    .query(async ({ ctx, input }) => {
      const where = buildWhere(input);
      const orderBy = buildOrderBy(input.sort);

      const [total, rows] = await Promise.all([
        ctx.db.subarea.count({ where }),
        ctx.db.subarea.findMany({
          where,
          select: {
            id: true,
            name: true,
            alias: true,
            regionId: true,
            entityType: true,
            entityId: true,
            address: true,
            property: true,
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

      const entityNameById = await resolveEntityNames(ctx.db, rows);

      const items = rows.map((row: SubareaWithRegion) => ({
        id: row.id,
        name: row.name,
        alias: row.alias,
        regionId: row.regionId,
        address: row.address,
        entityType: row.entityType,
        entityId: row.entityId,
        entityName:
          row.entityType && row.entityId
            ? (entityNameById.get(`${row.entityType}:${row.entityId}`) ?? null)
            : null,
        property: row.property,
        regionName: row.region?.name ?? null,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));

      return { items, total, page: input.page, pageSize: input.pageSize };
    }),

  /** 统计: 总数 / 启用 / 禁用 / 关联区域数 */
  stats: adminProcedure.query(async ({ ctx }) => {
    const [total, enabled, disabled, regionAgg] = await Promise.all([
      ctx.db.subarea.count(),
      ctx.db.subarea.count({ where: { status: 1 } }),
      ctx.db.subarea.count({ where: { status: 0 } }),
      ctx.db.subarea.groupBy({
        by: ["regionId"],
        where: { regionId: { not: null } },
      }),
    ]);

    return { total, enabled, disabled, regionCount: regionAgg.length };
  }),

  /** 全部区域(id + name),用于前端下拉 */
  regions: adminProcedure.query(({ ctx }) =>
    ctx.db.region.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ),

  /** 关联实体候选(id + name),按实体类型返回;entity_id 存的是这些表的主键 */
  entityOptions: adminProcedure
    .input(z.object({ type: z.enum(SUBAREA_ENTITY_TYPES) }))
    .query(async ({ ctx, input }) => {
      if (input.type === "community") {
        return ctx.db.community.findMany({
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        });
      }
      if (input.type === "village") {
        return ctx.db.village.findMany({
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        });
      }
      return ctx.db.poi.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
    }),

  /** 按 id 获取单条(含 region + 关联实体名) */
  getById: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.subarea.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          name: true,
          alias: true,
          regionId: true,
          status: true,
          address: true,
          entityType: true,
          entityId: true,
          property: true,
          createdAt: true,
          updatedAt: true,
          region: { select: { id: true, name: true } },
        },
      });
      if (!row) return null;
      const entityName = await resolveEntityName(
        ctx.db,
        row.entityType,
        row.entityId,
      );
      return { ...row, entityName };
    }),

  create: adminProcedure
    .input(subareaCreateInput)
    .mutation(({ ctx, input }) => {
      return ctx.db.subarea.create({
        data: {
          name: input.name,
          alias: toNullableAlias(input.alias),
          regionId: toRegionIdOrNull(input.regionId),
          entityType: toEntityOrNull(input.entityType) ?? null,
          entityId: toEntityOrNull(input.entityId) ?? null,
          address: toPrismaJson(input.address) ?? Prisma.JsonNull,
          property: toPrismaJson(input.property) ?? Prisma.JsonNull,
          status: input.status,
          createdAt: new Date(),
        },
      });
    }),

  update: adminProcedure
    .input(subareaUpdateInput)
    .mutation(({ ctx, input }) => {
      const data: Prisma.SubareaUncheckedUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.alias !== undefined) data.alias = toNullableAlias(input.alias);
      if (input.regionId !== undefined) data.regionId = input.regionId || null;
      const address = toPrismaJson(input.address);
      if (address !== undefined) data.address = address;
      if (input.entityType !== undefined)
        data.entityType = toEntityOrNull(input.entityType) ?? null;
      if (input.entityId !== undefined)
        data.entityId = toEntityOrNull(input.entityId) ?? null;
      const property = toPrismaJson(input.property);
      if (property !== undefined) data.property = property;
      if (input.status !== undefined) data.status = input.status;
      return ctx.db.subarea.update({ where: { id: input.id }, data });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) =>
      ctx.db.subarea.delete({ where: { id: input.id } }),
    ),

  deleteMany: adminProcedure
    .input(z.object({ ids: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.subarea.deleteMany({
        where: { id: { in: input.ids } },
      });
      return { count: result.count };
    }),

  /** 导出:按给定筛选条件一次返回全量(不分页) */
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
      const rows = await ctx.db.subarea.findMany({
        where,
        select: {
          id: true,
          name: true,
          alias: true,
          regionId: true,
          entityType: true,
          entityId: true,
          address: true,
          property: true,
          status: true,
          createdAt: true,
          region: { select: { name: true } },
        },
        orderBy: buildOrderBy(input.sort),
      });
      const entityNameById = await resolveEntityNames(ctx.db, rows);
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        alias: row.alias,
        regionId: row.regionId,
        regionName: row.region?.name ?? null,
        entityType: row.entityType,
        entityId: row.entityId,
        entityName:
          row.entityType && row.entityId
            ? (entityNameById.get(`${row.entityType}:${row.entityId}`) ?? null)
            : null,
        address: row.address,
        property: row.property,
        status: row.status,
        createdAt: row.createdAt,
      }));
    }),

  /** 导入(CSV / JSON 数组 -> 逐行 create);失败的行收集进 errors 不影响其它行 */
  import: adminProcedure
    .input(
      z.object({
        rows: z.array(subareaImportRow).min(1).max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let created = 0;
      const errors: Array<{ index: number; message: string }> = [];

      for (let i = 0; i < input.rows.length; i++) {
        const row = input.rows[i]!;
        try {
          await ctx.db.subarea.create({
            data: {
              name: row.name,
              alias: toNullableAlias(row.alias),
              regionId: toRegionIdOrNull(row.regionId),
              entityType: toEntityOrNull(row.entityType) ?? null,
              entityId: toEntityOrNull(row.entityId) ?? null,
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