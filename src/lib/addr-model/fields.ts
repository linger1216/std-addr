/**
 * 地址模型 · 27 地址要素字典(单一事实来源)。
 *
 * 使用方:
 *  - excel-io:导出列(源地址 + 27 要素)
 *  - addr-model-page:结构化字段展示、标注可视化
 *  - (未来)批量导入等
 */

/** 27 个地址要素(中文,顺序与地址要素字典一致) */
export const ADDR_FIELDS = [
  "省份", "城市", "区县", "街道", "镇", "乡", "小区", "村", "子区域",
  "路", "弄", "支弄", "路号", "楼栋", "楼层", "单元", "室号", "队", "组",
  "宅", "巷", "方向", "快速路", "高速公路", "位置类型", "兴趣点", "其他",
] as const;

/** 模型输出字段英文 key → 中文要素名(NER /api/format 的 data 键) */
export const FIELD_KEY_TO_ZH: Record<string, string> = {
  province: "省份", city: "城市", district: "区县", street: "街道", town: "镇",
  township: "乡", community: "小区", village: "村", subarea: "子区域",
  road: "路", lane: "弄", sub_lane: "支弄", road_number: "路号", building: "楼栋",
  floor: "楼层", unit: "单元", room: "室号", team: "队", group: "组",
  zhai: "宅", alley: "巷", direction: "方向", expressway: "快速路",
  highway: "高速公路", location_type: "位置类型", poi: "兴趣点", other: "其他",
};