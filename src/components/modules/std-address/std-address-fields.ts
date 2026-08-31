/**
 * 标准地址库 · 27 地址要素字典。
 *
 * 字段 key 与地址模型(addr-model)的 ADDR_FIELDS 同一套 27 要素;
 * key 来自 `@/lib/validators/std-address` 的 STD_ADDRESS_FIELD_KEYS(单一事实来源),
 * 与 NER 输出键(road_number/sub_lane/group)不同,勿混用。
 *
 * 使用方:std-address-table(全字段列)/ std-address-detail(详情)/ 编辑表单。
 */

import {
  STD_ADDRESS_FIELD_KEYS,
  type StdAddressFieldKey,
} from "@/lib/validators/std-address";

/** 要素中文标签(key → 标签) */
const LABELS: Record<StdAddressFieldKey, string> = {
  province: "省份",
  city: "城市",
  district: "区县",
  street: "街道",
  town: "镇",
  township: "乡",
  community: "小区",
  village: "村",
  subarea: "子区域",
  road: "路",
  lane: "弄",
  alley: "巷",
  subLane: "支弄",
  roadNumber: "路号",
  building: "楼栋",
  unit: "单元",
  team: "队",
  groupField: "组",
  zhai: "宅",
  floor: "楼层",
  room: "室号",
  direction: "方向",
  expressway: "快速路",
  highway: "高速公路",
  locationType: "位置类型",
  poi: "兴趣点",
  other: "其他",
};

/** 27 个地址要素:[表字段名, 中文标签](顺序即展示顺序) */
export const STD_ADDRESS_FIELDS = STD_ADDRESS_FIELD_KEYS.map(
  (k) => [k, LABELS[k]] as const,
);

/** 要素字段名联合(表列 key) */
export type { StdAddressFieldKey };