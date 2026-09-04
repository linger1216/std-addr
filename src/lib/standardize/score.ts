/**
 * 标准地址库 · 完整度评分(0-10,纯函数,可测)。
 *
 * 按地址类别评分(城市小区 / 城市POI / 农村):
 *  - 每类的「核心要素」凑满 = 6 分(base = round(命中/总数 × 6))
 *  - 核心之外要素(支弄/方向/单元/楼层/队/组/宅/巷/其他)每多一个 +1,封顶 10
 *  - 无法归入三类的纯行政地址保留行政基础分(居委3 / 街镇2 / 区县1)
 */
import { firstNonEmpty, type StdFields } from "./build";

/** 地址类别 */
export type AddressClass = "community" | "poi" | "rural" | "unknown";

/** 分类(纯函数,按 StdFields 判定) */
export function classifyClass(fields: StdFields): AddressClass {
  const hasRoad = Boolean(
    firstNonEmpty(fields.road, fields.lane, fields.road_number),
  );
  if (fields.village || fields.zhai) return "rural";
  if (fields.poi) return "poi";
  if (fields.community || fields.subarea || hasRoad) return "community";
  return "unknown";
}

const CLASS_LABEL: Record<AddressClass, string> = {
  community: "城市小区",
  poi: "城市POI",
  rural: "农村",
  unknown: "未归类(纯行政)",
};

/** 行政层级是否命中(省/市/区/街镇/居村委 任一非空即算) */
function hasAdmin(fields: StdFields): boolean {
  return Boolean(
    firstNonEmpty(
      fields.province,
      fields.city,
      fields.district,
      fields.street,
      fields.town,
      fields.region,
      fields.neighborhood,
    ),
  );
}

/** 核心要素命中检测(按类别,各要素等权) */
type CoreChecker = (f: StdFields) => boolean;

const COMMUNITY_CORE: Record<string, CoreChecker> = {
  行政: hasAdmin,
  路: (f) => Boolean(f.road),
  弄: (f) => Boolean(f.lane),
  号: (f) => Boolean(f.road_number),
  楼栋: (f) => Boolean(f.building),
  室号: (f) => Boolean(f.room),
};

const POI_CORE: Record<string, CoreChecker> = {
  行政: hasAdmin,
  路: (f) => Boolean(f.road),
  路号: (f) => Boolean(f.road_number),
  室号: (f) => Boolean(f.room),
};

const RURAL_CORE: Record<string, CoreChecker> = {
  行政: hasAdmin,
  村: (f) => Boolean(f.village),
  室号: (f) => Boolean(f.room),
};

/** 额外要素(每命中 +1,累加后封顶 10) */
const EXTRA_FIELDS: Array<[string, (f: StdFields) => boolean]> = [
  ["支弄", (f) => Boolean(f.sub_lane)],
  ["方向", (f) => Boolean(f.direction)],
  ["单元", (f) => Boolean(f.unit)],
  ["楼层", (f) => Boolean(f.floor)],
  ["队", (f) => Boolean(f.team)],
  ["组", (f) => Boolean(f.group)],
  ["宅", (f) => Boolean(f.zhai)],
  ["巷", (f) => Boolean(f.alley)],
  ["其他", (f) => Boolean(f.other)],
];

function coreMap(cls: AddressClass): Record<string, CoreChecker> {
  if (cls === "community") return COMMUNITY_CORE;
  if (cls === "poi") return POI_CORE;
  return RURAL_CORE;
}

/** 计算地址标准化完整度评分(0-10) */
export function calcScore(fields: StdFields): number {
  const cls = classifyClass(fields);

  // 无法归入三类:纯行政地址保留基础分(居委3 / 街镇2 / 区县及省市1),室号/方向各 +1
  if (cls === "unknown") {
    let total = 0;
    if (fields.region || fields.neighborhood) total = 3;
    else if (firstNonEmpty(fields.street, fields.town)) total = 2;
    else if (fields.district || fields.city || fields.province) total = 1;
    if (fields.room) total += 1;
    if (fields.direction) total += 1;
    return Math.min(total, 10);
  }

  const core = coreMap(cls);
  const entries = Object.entries(core);
  const hit = entries.filter(([, check]) => check(fields)).length;
  const base = Math.round((hit / entries.length) * 6);

  const extras = EXTRA_FIELDS.filter(([, check]) => check(fields)).length;
  return Math.min(base + extras, 10);
}

/** 评分明细(用于前端展示"得分的构成") */
export function formatScoreDetail(score: number, fields: StdFields): string[] {
  const lines: string[] = [];
  const cls = classifyClass(fields);
  lines.push(`类别：${CLASS_LABEL[cls]}`);

  if (cls === "unknown") {
    if (fields.region || fields.neighborhood) {
      lines.push(`居村委：${firstNonEmpty(fields.region, fields.neighborhood)} (+3)`);
    } else if (firstNonEmpty(fields.street, fields.town)) {
      lines.push(`街镇：${firstNonEmpty(fields.street, fields.town)} (+2)`);
    } else if (fields.district || fields.city || fields.province) {
      lines.push(`区县：${fields.district ?? fields.city ?? fields.province} (+1)`);
    } else {
      lines.push("行政：无");
    }
  } else {
    const core = coreMap(cls);
    let hit = 0;
    for (const [name, check] of Object.entries(core)) {
      if (check(fields)) {
        hit += 1;
        lines.push(`${name}：有`);
      } else {
        lines.push(`${name}：无`);
      }
    }
    lines.push(`核心凑满度：${hit}/${Object.keys(core).length} → +${Math.round((hit / Object.keys(core).length) * 6)}`);
  }

  const extras = EXTRA_FIELDS.filter(([, check]) => check(fields)).map(([n]) => n);
  if (extras.length) lines.push(`额外要素：${extras.join("、")} (+${extras.length})`);

  lines.push(`\n得分：${score} / 10`);
  return lines;
}
