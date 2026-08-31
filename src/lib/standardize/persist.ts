/**
 * 标准地址库 · 标准化字段 → 数据库可写字段(纯函数,可测)。
 *
 * 旧算法规格的 StdFields(road_number 归一为 number、农村组号叫 group)
 * 与 StdAddress 表列名(subLane/roadNumber/groupField/locationType)存在差异,
 * 写库前必须统一映射,否则 Prisma 会因未知字段抛校验错误(整批失败)。
 */

import type { StdFields } from "./build";

/** 表列名 → StdFields 来源键(列名一律用 Prisma 模型字段名) */
const COLUMN_SOURCES: Array<[string, keyof StdFields]> = [
  ["province", "province"],
  ["city", "city"],
  ["district", "district"],
  ["street", "street"],
  ["town", "town"],
  ["township", "township"],
  ["community", "community"],
  ["village", "village"],
  ["subarea", "subarea"],
  ["zhai", "zhai"],
  ["road", "road"],
  ["lane", "lane"],
  ["alley", "alley"],
  // 表列 sub_lane ← 旧算法 sub_lane
  ["subLane", "sub_lane"],
  // 表列 road_number ← 旧算法归一后的 number(road_number 已在流水线归并)
  ["roadNumber", "number"],
  ["building", "building"],
  ["unit", "unit"],
  ["team", "team"],
  // 表列 group_field ← 旧算法 group(农村组号;group 是 MySQL 关键字不能做列名)
  ["groupField", "group"],
  ["floor", "floor"],
  ["room", "room"],
  ["direction", "direction"],
  ["other", "other"],
  ["poi", "poi"],
  ["expressway", "expressway"],
  ["highway", "highway"],
  ["locationType", "locationType"],
];

/** 只返回全部 27 列;空值统一归一为 null(覆盖式写库,不留旧值) */
export function mapFieldsToPersist(
  fields: StdFields,
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [column, src] of COLUMN_SOURCES) {
    const v = fields[src];
    out[column] = v && v.trim() !== "" ? v.trim() : null;
  }
  return out;
}