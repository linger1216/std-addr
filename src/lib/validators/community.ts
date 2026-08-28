import { z } from "zod";

/**
 * 小区模块共享 zod schema —— 前端表单(react-hook-form)与后端 tRPC 校验
 * 使用同一份定义,保证字段规则前后一致。
 */

export const communityStatusSchema = z.union([z.literal(0), z.literal(1)]);

/**
 * 区划 ID:region.id 沿袭外部系统,不是 cuid 格式,只做基本字符串校验。
 * 空串 = "未指定"(前端 SearchSelect 的默认选项),由路由层归一为 null;
 * undefined = 未传(不处理)。
 */
export const optionalRegionIdSchema = z
  .union([
    z.string().trim().min(1, "区划 ID 不能为空").max(100, "区划 ID 最长 100 字"),
    z.literal(""),
  ])
  .optional();

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

/**
 * alias 接收多种形态:字符串(单值)、字符串数组(多值)、JSON 字符串。
 * router 内部用 parseAliasEntries 归一,落库为字符串数组或 NULL。
 */
export const aliasInputSchema = z
  .union([z.string(), z.array(z.string().trim().min(1).max(100))])
  .optional();

/** 新建 */
export const communityCreateSchema = z.object({
  name: z.string().trim().min(1, "名称不能为空").max(100, "名称最长 100 字"),
  alias: aliasInputSchema,
  regionId: optionalRegionIdSchema,
  address: jsonValueSchema,
  // geom: DDL 是 GEOMCOLLECTION,Prisma 不支持写入;暂不暴露给前端
  status: communityStatusSchema.default(1),
});

/** 更新(全部必填字段可选) */
export const communityUpdateSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1, "名称不能为空").max(100).optional(),
    alias: aliasInputSchema,
    regionId: optionalRegionIdSchema,
    address: jsonValueSchema,
    // geom: 同上,不在 update schema 中
    status: communityStatusSchema.optional(),
  })
  .refine((v) => Object.keys(v).some((k) => k !== "id"), {
    message: "至少提供一个要更新的字段",
  });

export type CommunityCreateInput = z.infer<typeof communityCreateSchema>;
export type CommunityUpdateInput = z.infer<typeof communityUpdateSchema>;