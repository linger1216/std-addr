import { z } from "zod";
import { Prisma } from "../../../../generated/prisma/client";

import {
  adminProcedure,
  createTRPCRouter,
} from "@/server/api/trpc";
import {
  labelCreateSchema,
  labelStatusSchema,
  labelUpdateSchema,
} from "@/lib/validators/label";
import { toErrorMessage } from "@/lib/constants";

const statusSchema = labelStatusSchema;

const labelCreateInput = labelCreateSchema;
const labelUpdateInput = labelUpdateSchema;

const labelImportRow = z.object({
  name: z.string().trim().min(1).max(100),
  label: z.string().trim().max(255).optional(),
  status: statusSchema.optional(),
});

/** 可排序列白名单:防止任意字符串进 Prisma orderBy */
const labelSortFields = ["name", "label", "status", "createdAt"] as const;

const listInput = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(20),
  q: z.string().trim().optional(),
  status: statusSchema.optional(),
  sort: z
    .array(
      z.object({
        id: z.enum(labelSortFields),
        desc: z.boolean().default(false),
      }),
    )
    .max(3)
    .optional(),
});

type FilterInput = Pick<z.infer<typeof listInput>, "q" | "status">;

function buildWhere(input: FilterInput): Prisma.LabelWhereInput {
  const where: Prisma.LabelWhereInput = {};
  if (input.q) {
    // name 必填且 @unique,label 可空,分别匹配
    where.OR = [
      { name: { contains: input.q } },
      { label: { contains: input.q } },
    ];
  }
  if (input.status !== undefined) where.status = input.status;
  return where;
}

function buildOrderBy(
  sort: z.infer<typeof listInput>["sort"],
): Prisma.LabelOrderByWithRelationInput[] {
  const orderBy: Prisma.LabelOrderByWithRelationInput[] = [];
  if (sort && sort.length > 0) {
    for (const s of sort) {
      const dir = s.desc ? "desc" : "asc";
      orderBy.push({ [s.id]: dir });
    }
  } else {
    orderBy.push({ status: "desc" }, { createdAt: "desc" });
  }
  return orderBy;
}

export const labelRouter = createTRPCRouter({
  /** 分页 + 搜索 + 状态筛选 + 排序 */
  list: adminProcedure
    .input(listInput)
    .query(async ({ ctx, input }) => {
      const where = buildWhere(input);
      const orderBy = buildOrderBy(input.sort);

      const [total, rows] = await Promise.all([
        ctx.db.label.count({ where }),
        ctx.db.label.findMany({
          where,
          orderBy,
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
        }),
      ]);

      const items = rows.map((row) => ({
        id: row.id,
        name: row.name,
        label: row.label,
        status: row.status,
        // 数据源默认配置(列表展示「数据源」列)
        data: row.data,
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
      ctx.db.label.count(),
      ctx.db.label.count({ where: { status: 1 } }),
      ctx.db.label.count({ where: { status: 0 } }),
    ]);

    return { total, enabled, disabled };
  }),

  /** 按 id 获取单条 */
  getById: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) =>
      ctx.db.label.findUnique({ where: { id: input.id } }),
    ),

  create: adminProcedure
    .input(labelCreateInput)
    .mutation(({ ctx, input }) =>
      ctx.db.label.create({
        data: {
          name: input.name,
          label: input.label ?? null,
          status: input.status,
          // P0-6:默认配置统一存 data 列(4 数据源 + 默认前后缀);null → JsonNull 清空
          ...(input.data !== undefined
            ? { data: input.data === null ? Prisma.JsonNull : (input.data as unknown as Prisma.InputJsonValue) }
            : {}),
          // prefix/suffix 独立列仅供旧数据读时兼容,新写入不再使用
          prefix: Prisma.JsonNull,
          suffix: Prisma.JsonNull,
          createdAt: new Date(),
        },
      }),
    ),

  update: adminProcedure
    .input(labelUpdateInput)
    .mutation(({ ctx, input }) => {
      const data: Prisma.LabelUncheckedUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.label !== undefined) data.label = input.label;
      if (input.status !== undefined) data.status = input.status;
      // P0-6:统一配置写入 data 列(undefined 不触碰,明确传 null 清空);
      // 同时清空旧 prefix/suffix 列,避免读时回退到过期值(prefix/suffix 已并入 data)
      if (input.data !== undefined) {
        data.data = input.data ?? Prisma.JsonNull;
        data.prefix = Prisma.JsonNull;
        data.suffix = Prisma.JsonNull;
      }
      return ctx.db.label.update({
        where: { id: input.id },
        data,
      });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) =>
      ctx.db.label.delete({ where: { id: input.id } }),
    ),

  /** 批量删除 */
  deleteMany: adminProcedure
    .input(z.object({ ids: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.label.deleteMany({
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
      const rows = await ctx.db.label.findMany({
        where,
        select: {
          id: true,
          name: true,
          label: true,
          status: true,
          createdAt: true,
        },
        orderBy: buildOrderBy(input.sort),
      });
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        label: row.label,
        status: row.status,
        createdAt: row.createdAt,
      }));
    }),

  /** 导入(CSV / JSON 数组 -> 逐行 create);失败的行收集进 errors 不影响其它行 */
  import: adminProcedure
    .input(
      z.object({
        rows: z.array(labelImportRow).min(1).max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let created = 0;
      const errors: Array<{ index: number; message: string }> = [];

      for (let i = 0; i < input.rows.length; i++) {
        const row = input.rows[i]!;
        try {
          // 重复 name 会被 @unique 拒绝,收集到 errors 里
          await ctx.db.label.create({
            data: {
              name: row.name,
              label: row.label ?? null,
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