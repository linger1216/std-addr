import { z } from "zod";
import { Prisma } from "../../../../generated/prisma/client";

import {
  adminProcedure,
  createTRPCRouter,
} from "@/server/api/trpc";
import {
  addrSimAffixSchema,
  addrSimRuleCreateSchema,
  addrSimRuleUpdateSchema,
} from "@/lib/validators/addr-sim";
import { migrateStep, parseLabelConfig } from "@/lib/addr-sim/migrate";

/**
 * 地址模拟(AddrSim)router。
 *
 * 职责:
 *  - stats:数据源卡片(道路/小区/村/POI 条目数 + 地址要素总数)
 *  - candidates:实体候选值(road/community/village/poi 全量 name)
 *  - labels:地址要素字典(label.name + label.label 显示名)
 *  - rule CRUD:规则配置持久化(表 label_mock_rule,rule 列存步骤 JSON)
 *
 * 生成逻辑不落库 —— 前端拉候选值 + 规则后在客户端生成,导出文件直接下载。
 */

/** 实体表候选值:road 取 road 列,其余取 name 列(见 candidates procedure) */

function toStepsJson(steps: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  // steps 为空数组 → JsonNull(等价 null);否则整体写入 JSON 数组
  if (Array.isArray(steps) && steps.length === 0) return Prisma.JsonNull;
  return steps as Prisma.InputJsonValue;
}

/**
 * 读时迁移:旧版步骤结构 → 新版。
 *
 * 兼容:
 *  - 数据源 key:步骤顶层 randomValue/customValue/randomNumber/randomChinese → 收拢进 data;
 *    data.{A,B,C,D} → 语义 key
 *  - prefix/suffix:旧 text 单值 → 新 texts 多值
 *
 * ruleList/ruleGet 返回时做迁移,保证前端永远拿新结构;
 * DB 不改写(避免迁移写放大),写入时(create/update)直接存新结构。
 */
function migrateSteps(steps: unknown): unknown[] {
  if (!Array.isArray(steps)) return [];
  return steps.map(migrateStep);
}

export const addrSimRouter = createTRPCRouter({
  /** 数据源卡片统计 + 地址要素总数 */
  stats: adminProcedure.query(async ({ ctx }) => {
    const [roadCount, communityCount, villageCount, poiCount, labelCount] =
      await Promise.all([
        ctx.db.road.count(),
        ctx.db.community.count(),
        ctx.db.village.count(),
        ctx.db.poi.count(),
        ctx.db.label.count(),
      ]);
    return {
      sources: {
        road: roadCount,
        community: communityCount,
        village: villageCount,
        poi: poiCount,
      },
      labelCount,
    };
  }),

  /** 实体候选值:四种实体全量名称(前端缓存,staleTime 30s) */
  candidates: adminProcedure.query(async ({ ctx }) => {
    const [roads, communities, villages, pois] = await Promise.all([
      ctx.db.road.findMany({
        where: { status: 1 },
        select: { road: true },
        orderBy: { road: "asc" },
      }),
      ctx.db.community.findMany({
        where: { status: 1 },
        select: { name: true },
        orderBy: { name: "asc" },
      }),
      ctx.db.village.findMany({
        where: { status: 1 },
        select: { name: true },
        orderBy: { name: "asc" },
      }),
      ctx.db.poi.findMany({
        where: { status: 1 },
        select: { name: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return {
      road: roads.map((r) => r.road),
      community: communities.map((c) => c.name),
      village: villages.map((v) => v.name),
      poi: pois.map((p) => p.name),
    };
  }),

  /** 地址要素字典(label.name + label.label 显示名 + P0-6 默认配置 data/prefix/suffix) */
  labels: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.label.findMany({
      where: { status: 1 },
      select: { id: true, name: true, label: true, data: true, prefix: true, suffix: true },
      orderBy: { name: "asc" },
    });
    return rows.map((r) => {
      // 统一配置(data 列含 4 源 + prefix/suffix);兼容旧字母 key 与旧独立列
      const config = parseLabelConfig(r.data);
      const legacyPrefix = addrSimAffixSchema.safeParse(r.prefix);
      const legacySuffix = addrSimAffixSchema.safeParse(r.suffix);
      return {
        id: r.id,
        name: r.name,
        label: r.label ?? r.name,
        data: config
          ? {
              randomValue: config.randomValue,
              customValue: config.customValue,
              randomNumber: config.randomNumber,
              randomChinese: config.randomChinese,
            }
          : undefined,
        prefix: config?.prefix ?? (legacyPrefix.success ? legacyPrefix.data : undefined),
        suffix: config?.suffix ?? (legacySuffix.success ? legacySuffix.data : undefined),
        skipRate: config?.skipRate ?? undefined,
        noiseRate: config?.noiseRate ?? undefined,
      };
    });
  }),

  /** 规则列表(全量,数量小不分页) */
  ruleList: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.addressMockRule.findMany({
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      // 读时迁移:旧 prefix/suffix 单值结构 → 新多值结构
      steps: migrateSteps(r.rule),
      radio: r.radio,
      count: r.count,
      total: r.total,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }),

  /** 按 id 获取单条规则 */
  ruleGet: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.addressMockRule.findUnique({
        where: { id: input.id },
      });
      if (!row) return null;
      return {
        id: row.id,
        name: row.name,
        steps: migrateSteps(row.rule),
        radio: row.radio,
        count: row.count,
        total: row.total,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    }),

  /** 新建规则(rule 列整体写入步骤 JSON + 占比) */
  ruleCreate: adminProcedure
    .input(addrSimRuleCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.addressMockRule.create({
        data: {
          name: input.name,
          rule: toStepsJson(input.steps),
          // undefined → 不写(null);有值 → 校验器已保证 1~100
          ...(input.radio !== undefined ? { radio: input.radio } : {}),
          // 样本数 / 总样本数(导入时写入)
          ...(input.count !== undefined ? { count: input.count } : {}),
          ...(input.total !== undefined ? { total: input.total } : {}),
          status: input.status ?? 1,
          createdAt: new Date(),
        },
      });
      return { id: row.id };
    }),

  /** 更新规则(名称 / 步骤整体替换 / 占比) */
  ruleUpdate: adminProcedure
    .input(addrSimRuleUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const data: Prisma.AddressMockRuleUncheckedUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.steps !== undefined) data.rule = toStepsJson(input.steps);
      // undefined → 不处理;null → 清空占比(明确传 null)
      if (input.radio !== undefined) data.radio = input.radio;
      if (input.count !== undefined) data.count = input.count;
      if (input.total !== undefined) data.total = input.total;
      if (input.status !== undefined) data.status = input.status;
      await ctx.db.addressMockRule.update({
        where: { id: input.id },
        data,
      });
      return { id: input.id };
    }),

  /** 删除单条 */
  ruleDelete: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      ctx.db.addressMockRule.delete({ where: { id: input.id } }),
    ),

  /** 批量删除 */
  ruleDeleteMany: adminProcedure
    .input(z.object({ ids: z.array(z.string().min(1)).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.addressMockRule.deleteMany({
        where: { id: { in: input.ids } },
      });
      return { count: result.count };
    }),

  /**
   * 批量更新占比(单条 radio,1~100 必填)。
   *
   * 用途(一次调用,避免 N 次 update 各自 toast/invalidate):
   *  - 从数据提取导入规则后,按「现有规则占比 + 新规则样本次数」重新分配全部占比;
   *  - 规则列表「快速分配占比」批量落库选中规则的占比。
   */
  ruleBatchUpdate: adminProcedure
    .input(
      z.object({
        updates: z
          .array(
            z.object({
              id: z.string().min(1),
              radio: z.number().int().min(1).max(100),
            }),
          )
          .min(1)
          .max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.$transaction(
        input.updates.map((u) =>
          ctx.db.addressMockRule.update({
            where: { id: u.id },
            data: { radio: u.radio },
          }),
        ),
      );
      return { count: input.updates.length };
    }),
});