/**
 * Label 表单的纯数据映射(无 React 依赖,便于单元测试)。
 * 对齐 community-form-mappers 模板;label 字段比 community 简单,无 region/alias/address。
 *
 * P0-6:Label 默认配置统一存 data 列(4 数据源 + 默认前后缀 + 整体跳过率)。
 * 表单内部仍是四段(数据来源 / 前缀 / 后缀 / 整体跳过率),加载时从统一 data 拆分,提交时合并回去。
 */

import { z } from "zod";
import {
  DEFAULT_NOISE_RATE,
  DEFAULT_SKIP_RATE,
  addrSimAffixSchema,
  type AddrSimAffix,
  type AddrSimLabelConfig,
  type AddrSimLabelData,
} from "@/lib/validators/addr-sim";
import { parseLabelConfig } from "@/lib/addr-sim/migrate";

/** 表单值(提交形态) */
export type LabelFormValues = {
  id: string | null;
  name: string;
  label: string;
  status: 0 | 1;
  /** 提交形态:统一配置(4 源 + 默认前后缀 + 整体跳过率);null = 未配置 */
  data: AddrSimLabelConfig | null;
  /** 旧列兼容:新提交不再单独携带(undefined = 后端不写),由 data 统一承载 */
  prefix?: AddrSimAffix | null;
  suffix?: AddrSimAffix | null;
};

/** 详情的最小结构(兼容 RouterOutputs 的 getById 输出) */
export type LabelDetailLike = {
  id: string;
  name: string;
  /** DB label 列允许 null,详情输出为 string | null;表单内收窄为 string(空串表示空) */
  label: string | null;
  /** DB 是 Int,详情输出为 number;表单内收窄为 0|1 */
  status: number;
  /** P0-6:三个 JSON 列,详情输出为 unknown(Prisma JsonValue | null) */
  data?: unknown;
  prefix?: unknown;
  suffix?: unknown;
  /** 仅用于区分「详情」与「旧提交值」两个分支 */
  createdAt?: unknown;
};

export const formSchema = z.object({
  id: z.string().nullable(),
  name: z.string().trim().min(1, "请输入名称").max(100, "名称最长 100 字"),
  label: z.string().trim().max(255, "标签最长 255 字"),
  status: z.union([z.literal(0), z.literal(1)]),
  // data/prefix/suffix/skipRate 由受控编辑器保证结构(LabelDataEditor/LabelAffixEditor/RateSlider),
  // 表单层只做类型收窄,不重复校验嵌套结构(避免 RHF+zod 的 optional 推断冲突)。
  data: z
    .custom<AddrSimLabelData | null>((v) => v === null || (typeof v === "object" && v !== undefined))
    .nullable()
    .optional(),
  prefix: z
    .custom<AddrSimAffix | null>((v) => v === null || (typeof v === "object" && v !== undefined))
    .nullable()
    .optional(),
  suffix: z
    .custom<AddrSimAffix | null>((v) => v === null || (typeof v === "object" && v !== undefined))
    .nullable()
    .optional(),
  skipRate: z.number().int().min(0).max(100),
  noiseRate: z.number().int().min(0).max(100),
});

export type FormSchema = z.infer<typeof formSchema>;

/** 新要素默认率:整体跳过 15%、干扰 15%(前缀/后缀跳过 10% 见 EMPTY_AFFIX) */
export const EMPTY_FORM: FormSchema = {
  id: null,
  name: "",
  label: "",
  status: 1,
  data: null,
  prefix: null,
  suffix: null,
  skipRate: DEFAULT_SKIP_RATE,
  noiseRate: DEFAULT_NOISE_RATE,
};

/** 把详情里的 affix JSON 值转成 schema 类型;失败返回 null */
function parseAffix(raw: unknown): AddrSimAffix | null {
  if (raw === null || raw === undefined) return null;
  const r = addrSimAffixSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/** 详情 / 旧提交值 → 表单初值 */
export function toForm(
  initial: LabelDetailLike | LabelFormValues | null,
): FormSchema {
  if (!initial) return EMPTY_FORM;
  // 统一配置(新格式):data 列含 sources + prefix + suffix + skipRate
  const config = parseLabelConfig(initial.data);
  return {
    id: initial.id,
    name: initial.name,
    label: initial.label ?? "",
    status: initial.status === 0 ? 0 : 1,
    data: config
      ? {
          randomValue: config.randomValue,
          customValue: config.customValue,
          randomNumber: config.randomNumber,
          randomChinese: config.randomChinese,
        }
      : null,
    // 优先取统一配置里的 prefix/suffix;旧数据(单独列)兜底
    prefix: config?.prefix ?? parseAffix(initial.prefix),
    suffix: config?.suffix ?? parseAffix(initial.suffix),
    // 未显式配置 → 兜底默认率(15/15)
    skipRate: config?.skipRate ?? DEFAULT_SKIP_RATE,
    noiseRate: config?.noiseRate ?? DEFAULT_NOISE_RATE,
  };
}

/** 表单 → 提交值:data/prefix/suffix/skipRate/noiseRate 合并成统一 data 配置;空白 label 保留(后端区分空 vs 未传) */
export function toSubmit(values: FormSchema): LabelFormValues {
  const merged: AddrSimLabelConfig = {
    ...(values.data ?? {}),
    ...(values.prefix ? { prefix: values.prefix } : {}),
    ...(values.suffix ? { suffix: values.suffix } : {}),
    // 始终写入(含默认值与显式 0),保证新字段一定落库、保存/重开往返一致
    skipRate: values.skipRate,
    noiseRate: values.noiseRate,
  };
  return {
    id: values.id,
    name: values.name.trim(),
    label: values.label.trim(),
    status: values.status,
    data: merged,
    // 新提交只写 data 列;prefix/suffix 独立列不再携带
    prefix: undefined,
    suffix: undefined,
  };
}