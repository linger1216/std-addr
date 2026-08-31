import { z } from "zod";

import {
  adminProcedure,
  createTRPCRouter,
} from "@/server/api/trpc";
import { standardizeService } from "@/server/services/standardizeService";
import { mapFieldsToPersist } from "@/lib/standardize/persist";
import { toErrorMessage } from "@/lib/constants";
import { Prisma } from "../../../../generated/prisma/client";

/** 可排序字段白名单(与表格表头打开的服务端排序对应) */
const stdAddressSortFields = [
  "rawAddress",
  "stdAddress",
  "stdScore",
  "status",
  "createdAt",
] as const;

const listInput = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(20),
  keyword: z.string().trim().optional(),
  status: z.union([z.literal(0), z.literal(1)]).optional(),
  sort: z
    .array(
      z.object({
        id: z.enum(stdAddressSortFields),
        desc: z.boolean().default(false),
      }),
    )
    .max(3)
    .optional(),
});

/** 创建/导入行:原始地址必填;标准输出字段可选 */
const stdAddressImportRow = z.object({
  rawAddress: z.string().trim().min(1).max(500),
  stdAddress: z.string().trim().max(500).optional(),
  stdScore: z.number().min(0).max(10).optional(),
});

/** 列表筛选(列表/导出共用) */
function buildWhere(input: {
  keyword?: string;
  status?: 0 | 1;
}): Prisma.StdAddressWhereInput {
  const where: Prisma.StdAddressWhereInput = {};
  if (input.status !== undefined) where.status = input.status;
  if (input.keyword) {
    where.OR = [
      { rawAddress: { contains: input.keyword } },
      { stdAddress: { contains: input.keyword } },
    ];
  }
  return where;
}

function buildOrderBy(
  sort: z.infer<typeof listInput>["sort"],
): Prisma.StdAddressOrderByWithRelationInput[] {
  if (sort && sort.length > 0) {
    return sort.map((s) => ({ [s.id]: s.desc ? "desc" : "asc" }));
  }
  return [{ createdAt: "desc" }];
}

export const stdAddressRouter = createTRPCRouter({
  /** 分页列表(原始/标准地址搜索 + 状态筛选 + 排序) */
  list: adminProcedure
    .input(listInput)
    .query(async ({ ctx, input }) => {
      const [total, items] = await Promise.all([
        ctx.db.stdAddress.count({ where: buildWhere(input) }),
        ctx.db.stdAddress.findMany({
          where: buildWhere(input),
          orderBy: buildOrderBy(input.sort),
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
        }),
      ]);
      return { items, total, page: input.page, pageSize: input.pageSize };
    }),

  /** 导出:按筛选条件一次返回全量(不分页) */
  exportAll: adminProcedure
    .input(
      z.object({
        keyword: listInput.shape.keyword,
        status: listInput.shape.status,
        sort: listInput.shape.sort,
      }),
    )
    .query(({ ctx, input }) =>
      ctx.db.stdAddress.findMany({
        where: buildWhere(input),
        orderBy: buildOrderBy(input.sort),
      }),
    ),

  /** 统计:总数 / 已标准化 / 未标准化 / 平均评分 */
  stats: adminProcedure.query(async ({ ctx }) => {
    const [total, standardized, pending, scoreAgg] = await Promise.all([
      ctx.db.stdAddress.count(),
      ctx.db.stdAddress.count({ where: { NOT: { stdAddress: null } } }),
      ctx.db.stdAddress.count({ where: { stdAddress: null } }),
      ctx.db.stdAddress.aggregate({ _avg: { stdScore: true } }),
    ]);
    return {
      total,
      standardized,
      pending,
      avgScore: scoreAgg._avg.stdScore ?? null,
    };
  }),

  /** 详情 */
  getById: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.stdAddress.findUnique({ where: { id: input.id } }),
    ),

  /** 核心:单条标准化(不落库,返回结果) */
  standardize: adminProcedure
    .input(z.object({ rawAddress: z.string().trim().min(1).max(500) }))
    .mutation(async ({ input }) => {
      try {
        const result = await standardizeService.standardize(input.rawAddress);
        return { ok: true, ...result };
      } catch (err) {
        return { ok: false, error: toErrorMessage(err) };
      }
    }),

  /** 批量标准化(按 id 列表,逐条更新落库) */
  standardizeBatch: adminProcedure
    .input(z.object({ ids: z.array(z.string()).min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const rows = await ctx.db.stdAddress.findMany({
        where: { id: { in: input.ids } },
      });
      let done = 0;
      const errors: Array<{ id: string; message: string }> = [];
      for (const row of rows) {
        try {
          const result = await standardizeService.standardize(row.rawAddress);
          await ctx.db.stdAddress.update({
            where: { id: row.id },
            data: {
              stdAddress: result.stdAddress || null,
              stdScore: result.stdScore,
              ...mapFieldsToPersist(result.fields),
            },
          });
          done++;
        } catch (err) {
          errors.push({ id: row.id, message: toErrorMessage(err) });
        }
      }
      return { done, failed: errors.length, errors };
    }),

  /** 创建(可预填标准结果) */
  create: adminProcedure
    .input(
      z.object({
        rawAddress: z.string().trim().min(1).max(500),
        stdAddress: z.string().trim().max(500).optional(),
        stdScore: z.number().min(0).max(10).optional(),
        status: z.union([z.literal(0), z.literal(1)]).default(1),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.db.stdAddress.create({
        data: {
          rawAddress: input.rawAddress,
          stdAddress: input.stdAddress ?? null,
          stdScore: input.stdScore ?? null,
          status: input.status,
        },
      }),
    ),

  /** 导入(原始地址列表,逐条可先标准化) */
  import: adminProcedure
    .input(
      z.object({
        rows: z.array(stdAddressImportRow).min(1).max(5000),
        autoStandardize: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let created = 0;
      let standardized = 0;
      const errors: Array<{ index: number; message: string }> = [];
      for (let i = 0; i < input.rows.length; i++) {
        const row = input.rows[i]!;
        try {
          const data: Prisma.StdAddressUncheckedCreateInput = {
            rawAddress: row.rawAddress,
            stdAddress: row.stdAddress ?? null,
            stdScore: row.stdScore ?? null,
          };
          if (input.autoStandardize) {
            const result = await standardizeService.standardize(row.rawAddress);
            data.stdAddress = result.stdAddress || null;
            data.stdScore = result.stdScore;
            // 旧算法规格字段 → 表列名映射(road_number→roadNumber 等),见 lib/standardize/persist
            Object.assign(data, mapFieldsToPersist(result.fields));
            standardized++;
          }
          await ctx.db.stdAddress.create({ data });
          created++;
        } catch (err) {
          errors.push({ index: i, message: toErrorMessage(err) });
        }
      }
      return { created, standardized, errors };
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        stdAddress: z.string().trim().max(500).optional(),
        stdScore: z.number().min(0).max(10).optional(),
        status: z.union([z.literal(0), z.literal(1)]).optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const data: Record<string, unknown> = {};
      if (input.stdAddress !== undefined) data.stdAddress = input.stdAddress;
      if (input.stdScore !== undefined) data.stdScore = input.stdScore;
      if (input.status !== undefined) data.status = input.status;
      return ctx.db.stdAddress.update({ where: { id: input.id }, data });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) =>
      ctx.db.stdAddress.delete({ where: { id: input.id } }),
    ),

  deleteMany: adminProcedure
    .input(z.object({ ids: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.stdAddress.deleteMany({
        where: { id: { in: input.ids } },
      });
      return { count: result.count };
    }),
});