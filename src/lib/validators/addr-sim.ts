import { z } from "zod";

/**
 * 地址模拟(AddrSim)共享 zod schema —— 前端步骤编辑器(react-hook-form 或受控组件)
 * 与后端 tRPC 校验使用同一份定义,保证规则结构前后一致。
 *
 * 存储格式与需求文档一致(数据来源四选一):
 * {
 *   name: "路",                    // 中文要素名(对应 label.label 显示名)
 *   randomValue: { name: "road" },              // 来源 A:实体表随机值
 *   customValue: { list: ["自定义一", ...] },    // 来源 B:自定义候选值(用户输入)
 *   randomNumber: { format, minDigits, maxDigits },  // 来源 C:随机数字
 *   randomChinese: { minLength, maxLength },         // 来源 D:随机中文
 *   prefix: { text, skipRate },   // 前/后缀(独立跳过率)
 *   suffix: { text, skipRate },
 *   skipRate: 20                  // 整步跳过概率(0~100)
 * }
 */

/** 实体数据源表名(与 DB 表对应,候选值取自该表) */
export const addrSimSourceNames = [
  "road",
  "community",
  "village",
  "poi",
] as const;
export type AddrSimSourceName = (typeof addrSimSourceNames)[number];

/**
 * 前后缀配置(多值 + 独立跳过率)。
 *
 * 结构演进(向后兼容 DB 已有数据):
 *  - 旧:`{ text: string, skipRate: number }`(单值)
 *  - 新:`{ texts: string[], skipRate: number }`(多值,UI 用 AliasTagInput 管理)
 *
 * 后端在读 ruleList/ruleGet 时自动迁移旧结构 → 新结构;前端与 schema 只认新结构。
 */
export const addrSimAffixSchema = z.object({
  /** 候选文本列表(任一非空;生成时按 skipRate 跳过整个 affix,通过后随机选一个拼接) */
  texts: z
    .array(z.string().trim().min(1).max(20, "前后缀最长 20 字"))
    .default([]),
  skipRate: z.number().int().min(0).max(100).default(0),
});

/** 数据来源 A:实体表随机值(randomValue.name 指向实体表名,候选值取自该表) */
export const addrSimRandomValueSchema = z.object({
  name: z.enum(addrSimSourceNames),
});

/** 数据来源 B:自定义候选值列表(用户输入,与实体表互斥) */
export const addrSimCustomValueSchema = z.object({
  /** 自定义候选值列表(不限制条数) */
  list: z
    .array(z.string().trim().min(1).max(50).default(""))
    .default([]),
});

/** 数据来源 B:随机数字 */
export const addrSimRandomNumberSchema = z.object({
  format: z.enum(["arabic", "chinese"]).default("arabic"),
  minDigits: z.number().int().min(1).max(9).default(1),
  maxDigits: z.number().int().min(1).max(9).default(4),
});

/** 数据来源 C:随机中文 */
export const addrSimRandomChineseSchema = z.object({
  minLength: z.number().int().min(1).max(20).default(2),
  maxLength: z.number().int().min(1).max(20).default(4),
});

/** 单个步骤(数据来源四选一 + prefix/suffix/skipRate) */
export const addrSimStepSchema = z
  .object({
    /** 中文要素名(对应 label 表显示名,如"路号"、"城市") */
    name: z.string().trim().min(1, "要素名不能为空").max(50, "要素名最长 50 字"),
    randomValue: addrSimRandomValueSchema.optional(),
    customValue: addrSimCustomValueSchema.optional(),
    randomNumber: addrSimRandomNumberSchema.optional(),
    randomChinese: addrSimRandomChineseSchema.optional(),
    prefix: addrSimAffixSchema.optional(),
    suffix: addrSimAffixSchema.optional(),
    /** 整步跳过概率(0~100) */
    skipRate: z.number().int().min(0).max(100).default(0),
  })
  .superRefine((val, ctx) => {
    // 数据来源必须四选一
    const sourceCount = [
      val.randomValue,
      val.customValue,
      val.randomNumber,
      val.randomChinese,
    ].filter((s) => s !== undefined).length;
    if (sourceCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sources"],
        message:
          "数据来源必须四选一(实体表 / 自定义列表 / randomNumber / randomChinese)",
      });
    }
    // 数字位数范围校验
    if (
      val.randomNumber &&
      val.randomNumber.minDigits > val.randomNumber.maxDigits
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["randomNumber"],
        message: "最小位数不能大于最大位数",
      });
    }
    // 中文长度范围校验
    if (
      val.randomChinese &&
      val.randomChinese.minLength > val.randomChinese.maxLength
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["randomChinese"],
        message: "最小长度不能大于最大长度",
      });
    }
  });

export type AddrSimStep = z.infer<typeof addrSimStepSchema>;
export type AddrSimRandomValue = z.infer<typeof addrSimRandomValueSchema>;
export type AddrSimCustomValue = z.infer<typeof addrSimCustomValueSchema>;
export type AddrSimRandomNumber = z.infer<typeof addrSimRandomNumberSchema>;
export type AddrSimRandomChinese = z.infer<typeof addrSimRandomChineseSchema>;
export type AddrSimAffix = z.infer<typeof addrSimAffixSchema>;

/** 规则:名称 + 有序步骤列表 + 占比(1~100,可空) */
export const addrSimRuleSchema = z.object({
  name: z.string().trim().min(1, "规则名不能为空").max(100, "规则名最长 100 字"),
  steps: z.array(addrSimStepSchema).max(30, "步骤最多 30 条"),
  /** 占比 1~100(从数据提取时按出现次数占比写入;未设置 = null) */
  radio: z.number().int().min(1).max(100).nullable().optional(),
  /** 启用(1)/禁用(0),默认启用 */
  status: z.union([z.literal(0), z.literal(1)]).optional(),
});

export type AddrSimRule = z.infer<typeof addrSimRuleSchema>;

/** 创建输入(rule 列整体写入) */
export const addrSimRuleCreateSchema = addrSimRuleSchema;

/** 更新输入 */
export const addrSimRuleUpdateSchema = addrSimRuleSchema.extend({
  id: z.string().min(1),
});

export type AddrSimRuleCreateInput = z.infer<typeof addrSimRuleCreateSchema>;
export type AddrSimRuleUpdateInput = z.infer<typeof addrSimRuleUpdateSchema>;