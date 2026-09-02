import { z } from "zod";

/**
 * 地址模拟(AddrSim)共享 zod schema —— 前端步骤编辑器(react-hook-form 或受控组件)
 * 与后端 tRPC 校验使用同一份定义,保证规则结构前后一致。
 *
 * 数据结构(P0-6 重构):
 *  - Label 表集中存储数据来源默认值:
 *    { data: { randomValue?, customValue?, randomNumber?, randomChinese? }, prefix?, suffix? }
 *    randomValue=实体表  customValue=自定义列表  randomNumber=随机数字  randomChinese=随机中文
 *  - 规则步骤只写 override(空则引用 Label 默认):
 *    { name, data?, prefix?, suffix?, skipRate }
 *  - 4 个数据源独立抽 1 后拼接(randomValue/customValue/randomNumber/randomChinese 同时存在 → 4 段拼接)
 *
 * 向后兼容:
 *  - 旧 prefix/suffix 单值(text)→ 新多值(texts),迁移见 server/api/routers/addr-sim.ts
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
 * 默认率(地址要素未显式配置时的兜底):
 *  - 前后缀跳过率 10%
 *  - 整体跳过率 15%
 *  - 干扰率 15%(生成时注入错别字/丢字/漏字,用于训练干扰项)
 */
export const DEFAULT_AFFIX_SKIP_RATE = 10;
export const DEFAULT_SKIP_RATE = 15;
export const DEFAULT_NOISE_RATE = 15;

/**
 * 前后缀配置(多值 + 独立跳过率)。
 *
 * 结构演进(向后兼容 DB 已有数据):
 *  - 旧:`{ text: string, skipRate: number }`(单值)
 *  - 新:`{ texts: string[], skipRate: number }`(多值,UI 用 AliasTagInput 管理)
 *
 * skipRate 为 optional:未设置时在 resolver 里兜底为 DEFAULT_AFFIX_SKIP_RATE(10)。
 * 后端在读 ruleList/ruleGet 时自动迁移旧结构 → 新结构;前端与 schema 只认新结构。
 */
export const addrSimAffixSchema = z.object({
  /** 候选文本列表(任一非空;生成时按 skipRate 跳过整个 affix,通过后随机选一个拼接) */
  texts: z
    .array(z.string().trim().min(1).max(20, "前后缀最长 20 字"))
    .default([]),
  skipRate: z.number().int().min(0).max(100).optional(),
});

/** 数据来源 randomValue:实体表随机值(randomValue.name 指向实体表名,候选值取自该表) */
export const addrSimRandomValueSchema = z.object({
  name: z.enum(addrSimSourceNames),
});

/** 数据来源 customValue:自定义候选值列表(用户输入,与实体表独立,不再合并) */
export const addrSimCustomValueSchema = z.object({
  /** 自定义候选值列表(不限制条数) */
  list: z
    .array(z.string().trim().min(1).max(50).default(""))
    .default([]),
});

/** 数据来源 randomNumber:随机数字 */
export const addrSimRandomNumberSchema = z.object({
  format: z.enum(["arabic", "chinese"]).default("arabic"),
  minDigits: z.number().int().min(1).max(9).default(1),
  maxDigits: z.number().int().min(1).max(9).default(4),
  /**
   * P0-3:真实位数直方图(从 LS 抽取时按样本位数自动生成)。
   * key 为位数(字符串,JSON 限制),value 为出现次数。
   * 有 weights 时按权重采样位数;无 weights 时按 minDigits/maxDigits 均匀采样。
   */
  weights: z.record(z.string(), z.number().int().min(0)).optional(),
});

/** 数据来源 randomChinese:随机中文 */
export const addrSimRandomChineseSchema = z.object({
  minLength: z.number().int().min(1).max(20).default(2),
  maxLength: z.number().int().min(1).max(20).default(4),
});

/**
 * P0-6:4 个数据源键名(与历史 randomValue/customValue/randomNumber/randomChinese 命名对齐)。
 *  - randomValue:实体表
 *  - customValue:自定义列表
 *  - randomNumber:随机数字
 *  - randomChinese:随机中文
 *
 * 4 个源各自独立从对应集合抽 1 条,启用项拼接成最终值(不再合并池)。
 *
 * schema 顶层非 optional(便于 TS 按 key 索引),但每个 key 仍 optional。
 * 使用方对 step.data 用 NonNullable 即可。
 */
export const addrSimLabelDataSchema = z.object({
  randomValue: addrSimRandomValueSchema.optional(),
  customValue: addrSimCustomValueSchema.optional(),
  randomNumber: addrSimRandomNumberSchema.optional(),
  randomChinese: addrSimRandomChineseSchema.optional(),
});

/**
 * 地址要素(Label)的完整默认配置 —— 集中存储在一个 JSON(data 列)里:
 *  - 4 个数据源(randomValue/customValue/randomNumber/randomChinese)
 *  - 默认前缀/后缀 prefix / suffix(各自含 texts + skipRate)
 *  - 整体默认跳过率 skipRate(生成时该要素有概率整步丢失;规则步骤未覆盖时生效)
 *  - 默认干扰率 noiseRate(生成时注入错别字/丢字/漏字,用于训练干扰项)
 *
 * 规则步骤只写差异(override),生成时引用这里;步骤里的 prefix/suffix 仍是步骤级字段,不混入本 schema。
 */
export const addrSimLabelConfigSchema = addrSimLabelDataSchema.extend({
  prefix: addrSimAffixSchema.optional(),
  suffix: addrSimAffixSchema.optional(),
  skipRate: z.number().int().min(0).max(100).optional(),
  noiseRate: z.number().int().min(0).max(100).optional(),
});

/**
 * 单个步骤(规则.rule 列里的步骤):
 *  - name:中文要素名(对应 label.name)
 *  - data?:覆盖 label 默认的 4 源配置(partial merge);undefined 时完全引用 label 默认
 *  - prefix? / suffix?:覆盖 label 默认前后缀
 *  - skipRate:整步跳过概率(0~100);未设置引用 label 默认
 *  - noiseRate:干扰率(0~100);未设置引用 label 默认
 *
 * 全部 source 字段从必填改为可选 —— 步骤可以为空(全靠 label 默认),
 * 也可以只覆盖部分字段(partial)。
 */
export const addrSimStepSchema = z
  .object({
    name: z.string().trim().min(1, "要素名不能为空").max(50, "要素名最长 50 字"),
    data: addrSimLabelDataSchema.optional(),
    prefix: addrSimAffixSchema.optional(),
    suffix: addrSimAffixSchema.optional(),
    /** 整步跳过概率(0~100);未设置(undefined)时引用 label 默认 skipRate */
    skipRate: z.number().int().min(0).max(100).optional(),
    /** 干扰率(0~100);未设置(undefined)时引用 label 默认 noiseRate */
    noiseRate: z.number().int().min(0).max(100).optional(),
  })
  .superRefine((val, ctx) => {
    // data.randomNumber 数字位数范围校验(minDigits 不能大于 maxDigits)
    const c = val.data?.randomNumber;
    if (c && c.minDigits > c.maxDigits) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data", "randomNumber"],
        message: "最小位数不能大于最大位数",
      });
    }
    // data.randomChinese 中文长度范围校验
    const d = val.data?.randomChinese;
    if (d && d.minLength > d.maxLength) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data", "randomChinese"],
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
export type AddrSimLabelData = z.infer<typeof addrSimLabelDataSchema>;
export type AddrSimLabelConfig = z.infer<typeof addrSimLabelConfigSchema>;

/** 步骤合并后的数据(运行时形态):data 必填、prefix/suffix 可选、rate 均为已兜底数字 */
export interface ResolvedAddrSimStep {
  name: string;
  data: NonNullable<AddrSimLabelData>;
  prefix?: AddrSimAffix;
  suffix?: AddrSimAffix;
  skipRate: number;
  /** 干扰率(生成时注入错别字/丢字/漏字);label 默认,步骤不单独覆盖 */
  noiseRate: number;
}

/**
 * Label 字典(集中存储的默认配置):
 *  - name:要素英文名(唯一)
 *  - label:中文显示名
 *  - data / prefix / suffix / skipRate:默认数据来源 + 默认前后缀 + 整体跳过率
 */
export const addrSimLabelSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  label: z.string().optional(),
  data: addrSimLabelDataSchema,
  prefix: addrSimAffixSchema.optional(),
  suffix: addrSimAffixSchema.optional(),
  skipRate: z.number().int().min(0).max(100).optional(),
  noiseRate: z.number().int().min(0).max(100).optional(),
  status: z.number().int().optional(),
});

export type AddrSimLabel = z.infer<typeof addrSimLabelSchema>;

/** 规则:名称 + 有序步骤列表 + 实际占比 + 样本数 */
export const addrSimRuleSchema = z.object({
  name: z.string().trim().min(1, "规则名不能为空").max(100, "规则名最长 100 字"),
  steps: z.array(addrSimStepSchema).max(30, "步骤最多 30 条"),
  /** 实际占比 1~100(导入后按样本次数自动计算;未设置 = null) */
  radio: z.number().int().min(1).max(100).nullable().optional(),
  /** 规则样本数(导入时写入;手动创建 = null) */
  count: z.number().int().min(0).optional(),
  /** 总样本数(该规则所属导入文件的总记录数,记录/展示用) */
  total: z.number().int().min(0).optional(),
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
