/**
 * 标准地址 · 27 地址要素的字段名与共享 zod schema(单一事实来源)。
 *
 * 字段名与 prisma StdAddress 表列、std-address-fields.ts 的中文标签一一对应;
 * 前端表单(react-hook-form)与后端 tRPC 校验共用本 schema。
 */

import { z, type ZodNullable, type ZodOptional, type ZodString } from "zod";

/** 27 个地址要素的表字段名(顺序与 STD_ADDRESS_FIELDS 中文标签一致) */
export const STD_ADDRESS_FIELD_KEYS = [
  "province",
  "city",
  "district",
  "street",
  "town",
  "community",
  "village",
  "subarea",
  "road",
  "lane",
  "alley",
  "subLane",
  "roadNumber",
  "building",
  "unit",
  "team",
  "groupField",
  "zhai",
  "floor",
  "room",
  "direction",
  "expressway",
  "highway",
  "locationType",
  "poi",
  "other",
] as const;

export type StdAddressFieldKey = (typeof STD_ADDRESS_FIELD_KEYS)[number];

/**
 * 要素字段值:
 *  - null = 清空该要素
 *  - undefined = 不修改(仅 update 语义;create/表单侧会归一为 null/string)
 *  - 字符串 = 新值(最长 100 字)
 */
export const addressFieldsSchema: z.ZodObject<
  Record<StdAddressFieldKey, ZodOptional<ZodNullable<ZodString>>>
> = z.object(
  Object.fromEntries(
    STD_ADDRESS_FIELD_KEYS.map((k) => [
      k,
      z.string().trim().max(100, "要素最长 100 字").nullable().optional(),
    ]),
  ) as Record<StdAddressFieldKey, ZodOptional<ZodNullable<ZodString>>>,
);