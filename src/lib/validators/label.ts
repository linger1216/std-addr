import { z } from "zod";
import {
  addrSimAffixSchema,
  addrSimLabelConfigSchema,
} from "./addr-sim";

/**
 * Label 模块共享 zod schema —— 前端表单(react-hook-form)与后端 tRPC 校验
 * 使用同一份定义,保证字段规则前后一致。
 *
 * P0-6:Label 的默认配置集中存在 data 列(一个 JSON,含 4 个数据源 + 默认前后缀):
 *  - data   = { randomValue?, customValue?, randomNumber?, randomChinese?, prefix?, suffix? }
 *    prefix/suffix 各为 { texts, skipRate }
 *  - prefix / suffix 列保留为旧数据兼容(新写入只写 data 列)
 */

export const labelStatusSchema = z.union([z.literal(0), z.literal(1)]);

/** data 列(JSON;允许 undefined/null)存统一配置:4 数据源 + 默认前后缀 */
export const labelDataSchema = addrSimLabelConfigSchema.nullable().optional();
/** prefix / suffix 列(JSON;允许 undefined/null)旧数据兼容,新代码不再写 */
export const labelAffixSchema = addrSimAffixSchema.nullable().optional();

/** 新建 */
export const labelCreateSchema = z.object({
  name: z.string().trim().min(1, "名称不能为空").max(100, "名称最长 100 字"),
  label: z.string().trim().max(255, "标签最长 255 字").optional(),
  status: labelStatusSchema.default(1),
  data: labelDataSchema,
  prefix: labelAffixSchema,
  suffix: labelAffixSchema,
});

/** 更新(全部必填字段可选) */
export const labelUpdateSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1, "名称不能为空").max(100, "名称最长 100 字").optional(),
    label: z.string().trim().max(255, "标签最长 255 字").optional(),
    status: labelStatusSchema.optional(),
    data: labelDataSchema,
    prefix: labelAffixSchema,
    suffix: labelAffixSchema,
  })
  .refine((v) => Object.keys(v).some((k) => k !== "id"), {
    message: "至少提供一个要更新的字段",
  });

export type LabelCreateInput = z.infer<typeof labelCreateSchema>;
export type LabelUpdateInput = z.infer<typeof labelUpdateSchema>;
