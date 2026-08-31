/**
 * 标准地址库 · 27 地址要素字典(单一事实来源)。
 *
 * 与地址模型(addr-model)的 ADDR_FIELDS 同一套 27 要素;
 * 此处 key 是 std_address 表 Prisma 模型字段名(roadNumber/subLane/groupField 等),
 * 与 NER 输出键(road_number/sub_lane/group)不同,勿混用。
 *
 * 使用方:std-address-table(全字段列)/ std-address-detail(详情)/ 表单。
 */

/** 27 个地址要素:表字段名 → 中文标签(顺序构成表格列顺序) */
export const STD_ADDRESS_FIELDS = [
  ["province", "省份"],
  ["city", "城市"],
  ["district", "区县"],
  ["street", "街道"],
  ["town", "镇"],
  ["township", "乡"],
  ["community", "小区"],
  ["village", "村"],
  ["subarea", "子区域"],
  ["road", "路"],
  ["lane", "弄"],
  ["alley", "巷"],
  ["subLane", "支弄"],
  ["roadNumber", "路号"],
  ["building", "楼栋"],
  ["unit", "单元"],
  ["team", "队"],
  ["groupField", "组"],
  ["zhai", "宅"],
  ["floor", "楼层"],
  ["room", "室号"],
  ["direction", "方向"],
  ["expressway", "快速路"],
  ["highway", "高速公路"],
  ["locationType", "位置类型"],
  ["poi", "兴趣点"],
  ["other", "其他"],
] as const satisfies ReadonlyArray<readonly [string, string]>;

/** 要素字段名联合(表列 key) */
export type StdAddressFieldKey = (typeof STD_ADDRESS_FIELDS)[number][0];