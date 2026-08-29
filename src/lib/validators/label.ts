import { z } from "zod";

/**
 * Label 模块共享 zod schema —— 前端表单(react-hook-form)与后端 tRPC 校验
 * 使用同一份定义,保证字段规则前后一致。
 */

export const labelStatusSchema = z.union([z.literal(0), z.literal(1)]);

/** 新建 */
export const labelCreateSchema = z.object({
  name: z.string().trim().min(1, "名称不能为空").max(100, "名称最长 100 字"),
  label: z.string().trim().max(255, "标签最长 255 字").optional(),
  status: labelStatusSchema.default(1),
});

/** 更新(全部必填字段可选) */
export const labelUpdateSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1, "名称不能为空").max(100, "名称最长 100 字").optional(),
    label: z.string().trim().max(255, "标签最长 255 字").optional(),
    status: labelStatusSchema.optional(),
  })
  .refine((v) => Object.keys(v).some((k) => k !== "id"), {
    message: "至少提供一个要更新的字段",
  });

export type LabelCreateInput = z.infer<typeof labelCreateSchema>;
export type LabelUpdateInput = z.infer<typeof labelUpdateSchema>;
