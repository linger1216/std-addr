import { z } from "zod";

/**
 * 子区域模块共享 zod schema —— 前端表单(react-hook-form)与后端 tRPC 校验
 * 使用同一份定义,保证字段规则前后一致(以 community 为标准)。
 */

export const subareaStatusSchema = z.union([z.literal(0), z.literal(1)]);

/** 区划 ID:空串 = "未指定",路由层归一为 null */
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

/** alias 接收多种形态:字符串(单值)、字符串数组(多值)、JSON 字符串 */
export const aliasInputSchema = z
  .union([z.string(), z.array(z.string().trim().min(1).max(100))])
  .optional();

/** 新建 */
export const subareaCreateSchema = z.object({
  name: z.string().trim().min(1, "名称不能为空").max(100, "名称最长 100 字"),
  alias: aliasInputSchema,
  regionId: optionalRegionIdSchema,
  // 所属实体(表名 / 实体 ID):子区域通常挂靠在小区/村/POI 下
  entityType: z.string().trim().max(50).optional(),
  entityId: z.string().trim().max(50).optional(),
  address: jsonValueSchema,
  // property:子区域属性(JSON),如 {"building":["1","3"],"floor":["2"]}
  property: jsonValueSchema,
  // geom: DDL 是 GEOMCOLLECTION,Prisma 不支持写入;暂不暴露给前端
  status: subareaStatusSchema.default(1),
});

/** 更新(全部必填字段可选) */
export const subareaUpdateSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1, "名称不能为空").max(100).optional(),
    alias: aliasInputSchema,
    regionId: optionalRegionIdSchema,
    entityType: z.string().trim().max(50).optional(),
    entityId: z.string().trim().max(50).optional(),
    address: jsonValueSchema,
    property: jsonValueSchema,
    status: subareaStatusSchema.optional(),
  })
  .refine((v) => Object.keys(v).some((k) => k !== "id"), {
    message: "至少提供一个要更新的字段",
  });

export type SubareaCreateInput = z.infer<typeof subareaCreateSchema>;
export type SubareaUpdateInput = z.infer<typeof subareaUpdateSchema>;