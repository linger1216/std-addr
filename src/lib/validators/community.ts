import { z } from "zod";

/**
 * 小区模块共享 zod schema —— 前端表单(react-hook-form)与后端 tRPC 校验
 * 使用同一份定义,保证字段规则前后一致。
 */

export const communityStatusSchema = z.union([z.literal(0), z.literal(1)]);

/** JSON 字段:address / geom 接收任意可序列化值 */
export const jsonValueSchema = z
  .union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(z.unknown()),
    z.record(z.unknown()),
  ])
  .optional();

/** 新建 */
export const communityCreateSchema = z.object({
  name: z.string().trim().min(1, "名称不能为空").max(100, "名称最长 100 字"),
  alias: z.string().trim().max(100, "别名最长 100 字").optional(),
  regionId: z.string().cuid("区划 ID 不合法").optional(),
  address: jsonValueSchema,
  geom: jsonValueSchema,
  status: communityStatusSchema.default(1),
});

/** 更新(全部必填字段可选) */
export const communityUpdateSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1, "名称不能为空").max(100).optional(),
    alias: z.string().trim().max(100).optional(),
    regionId: z.string().cuid().optional(),
    address: jsonValueSchema,
    geom: jsonValueSchema,
    status: communityStatusSchema.optional(),
  })
  .refine((v) => Object.keys(v).some((k) => k !== "id"), {
    message: "至少提供一个要更新的字段",
  });

export type CommunityCreateInput = z.infer<typeof communityCreateSchema>;
export type CommunityUpdateInput = z.infer<typeof communityUpdateSchema>;