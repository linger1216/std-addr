import { z } from "zod";

import type { RegionJsonOrgNode } from "@/lib/region-import";

/**
 * 行政区划(regions)模块共享 zod schema —— 前端表单与后端 tRPC 校验共用。
 * 字段语义对齐 region.json:
 *   code        = addressStandardCode(行政区划标准编码,唯一)
 *   parentCode  = 父区划的 code(不是 id);空串 = 顶级
 */

export const regionStatusSchema = z.union([z.literal(0), z.literal(1)]);

/** code:标准编码,必填、trim、限长(如 310112502001) */
export const regionCodeSchema = z
  .string()
  .trim()
  .min(1, "编码不能为空")
  .max(50, "编码最长 50 字");

/** 名称:与 region.json orgName 对齐 */
const regionNameSchema = z
  .string()
  .trim()
  .min(1, "名称不能为空")
  .max(100, "名称最长 100 字");

/** 上级编码归一:""/undefined → null(顶级),只把非空串作为 parentCode */
export const optionalParentCodeSchema = z
  .union([z.string().trim().min(1, "上级编码最长 50 字").max(50), z.literal("")])
  .optional();

/** 新建 */
export const regionCreateSchema = z.object({
  name: regionNameSchema,
  code: regionCodeSchema,
  /** 上级区划 code;""= 顶级(与 SearchSelect 空值约定一致) */
  parentCode: optionalParentCodeSchema,
  /** 区划类型,如 省/市/区/街道/镇/居(村)委会(可留空) */
  type: z.string().trim().max(50, "类型最长 50 字").nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  status: regionStatusSchema.default(1),
});

/** 更新(除 id 外全部可选) */
export const regionUpdateSchema = z
  .object({
    id: z.string().min(1),
    name: regionNameSchema.optional(),
    code: regionCodeSchema.optional(),
    parentCode: optionalParentCodeSchema,
    type: z.string().trim().max(50, "类型最长 50 字").nullable().optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    status: regionStatusSchema.optional(),
  })
  .refine((v) => Object.keys(v).some((k) => k !== "id"), {
    message: "至少提供一个要更新的字段",
  });

export type RegionCreateInput = z.infer<typeof regionCreateSchema>;
export type RegionUpdateInput = z.infer<typeof regionUpdateSchema>;

/** region.json 单节点(递归);类型与 src/lib/region-import.ts 的 RegionJsonOrgNode 严格同源 */
export const regionImportNodeSchema: z.ZodType<RegionJsonOrgNode> = z.lazy(() =>
  z.object({
    orgCode: z.string(),
    parentOrgCode: z.string().nullable(),
    orgName: z.string(),
    areaCode: z.string().nullable(),
    addressStandardCode: z.string().nullable(),
    childList: z.array(regionImportNodeSchema).optional(),
  }),
);

/** 导入入参:region.json envelope 的 data 数组 */
export const regionImportSchema = z.object({
  data: z.array(regionImportNodeSchema).min(1, "文件里没有区划数据").max(1000),
});