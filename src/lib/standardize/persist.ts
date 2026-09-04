/**
 * 标准地址库 · 标准化字段 → 数据库可写字段(纯函数,可测)。
 *
 * StdFields 的 NER 原生 key(road_number/sub_lane/group)与 StdAddress 表列名
 * (roadNumber/subLane/groupField/locationType)存在差异,写库前必须统一映射,
 * 否则 Prisma 会因未知字段抛校验错误(整批失败)。路号沿用 NER 原生键 road_number。
 * 乡(township)在入库前已并入 town(统称为 town),故不再单独映射。
 */

import type { StdFields } from "./build";

/** 表列名 → StdFields 来源键(列名一律用 Prisma 模型字段名) */
const COLUMN_SOURCES: Array<[string, keyof StdFields]> = [
  ["province", "province"],
  ["city", "city"],
  ["district", "district"],
  ["street", "street"],
  ["town", "town"],
  ["community", "community"],
  ["village", "village"],
  ["subarea", "subarea"],
  ["zhai", "zhai"],
  ["road", "road"],
  ["lane", "lane"],
  ["alley", "alley"],
  // 表列 sub_lane ← 旧算法 sub_lane
  ["subLane", "sub_lane"],
  // 表列 road_number ← NER 原生键 road_number(沿用,不归一为 number)
  ["roadNumber", "road_number"],
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
  // 表列 region ← 流水线居委(居民委员会/村民委员会)
  ["region", "region"],
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