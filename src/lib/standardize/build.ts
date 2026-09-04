/**
 * 标准地址库 · 标准地址拼接(纯函数,可测)。
 *
 * 从旧架构 standardizeService.#buildStdAddress 迁移:
 *  - 行政区域(省/市/区/街镇)去重拼接
 *  - 路弄号(road 逗号合并 / lane+弄 / alley+巷 / sub_lane+支弄 / number+号)
 *  - 无详细门牌但有地标(小区/子区域/POI)时补地标
 *  - 农村(村+宅+队+组,方向)
 *  - 楼栋(号楼+单元+层+室)
 */

/** 标准化后的地址字段(27 要素 + 旧算法额外字段) */
export interface StdFields {
  province?: string;
  city?: string;
  district?: string;
  street?: string;
  town?: string;
  community?: string;
  village?: string;
  subarea?: string;
  zhai?: string;
  road?: string;
  lane?: string;
  alley?: string;
  sub_lane?: string;
  building?: string;
  unit?: string;
  team?: string;
  group?: string;
  floor?: string;
  room?: string;
  direction?: string;
  other?: string;
  poi?: string;
  /** 居委(旧算法字段,评分用) */
  region?: string;
  /** 居民委员会/村民委员会(level2 区划,流水线内部字段,无 DB 列) */
  neighborhood?: string;
  /** NER 27 要素补充字段 */
  /** 路号(NER 原生键;流程内归一为 number) */
  road_number?: string;
  expressway?: string;
  highway?: string;
  locationType?: string;
  group_field?: string;
}

/** 取第一个非空字符串(空串与 undefined 都视为缺失,与代码库 truthiness 约定一致) */
export function firstNonEmpty(
  ...values: Array<string | undefined>
): string | undefined {
  return values.find((v): v is string => v != null && v !== "");
}

/** 拼接标准地址(与旧算法#buildStdAddress 1:1) */
export function buildStdAddress(fields: StdFields): string {
  const parts: string[] = [];

  // 行政区域
  const admin = [
    fields.province,
    fields.city,
    fields.district,
    firstNonEmpty(fields.street, fields.town),
  ].filter((x): x is string => Boolean(x));

  // 行政区划去重(连续相同/包含则跳过)
  const de_duplicated: string[] = [];
  for (const a of admin) {
    const last = de_duplicated[de_duplicated.length - 1];
    if (last !== undefined && (last === a || a.includes(last))) {
      continue;
    }
    de_duplicated.push(a);
  }
  if (de_duplicated.length > 0) parts.push(de_duplicated.join(""));

  // 道路门牌
  const roadParts: string[] = [];
  if (fields.road) {
    const roads = fields.road.split(",").filter(Boolean).map((s) => s.trim()).join("");
    if (roads) roadParts.push(roads);
  }
  if (fields.lane) roadParts.push(`${fields.lane.replace(/弄$/, "")}弄`);
  if (fields.alley) roadParts.push(`${fields.alley.replace(/巷$/, "")}巷`);
  if (fields.sub_lane) roadParts.push(fields.sub_lane.includes("支弄") ? fields.sub_lane : `${fields.sub_lane}支弄`);
  if (fields.road_number) roadParts.push(`${fields.road_number.replace(/号$/, "")}号`);

  if (roadParts.length > 0 && fields.road) parts.push(roadParts.join(""));

  const hasLaneOrNumber = Boolean(firstNonEmpty(fields.lane, fields.road_number));
  if (!hasLaneOrNumber) {
    const extra = firstNonEmpty(fields.community, fields.subarea, fields.poi);
    if (extra) parts.push(extra);
  }

  // 农村信息
  const villageParts: string[] = [];
  if (fields.village) villageParts.push(fields.village);
  if (fields.zhai) villageParts.push(`${fields.zhai.replace(/宅$/, "")}宅`);
  else if (fields.village && fields.subarea) villageParts.push(fields.subarea);
  if (fields.team) villageParts.push(fields.team.endsWith("队") ? fields.team : `${fields.team}队`);
  if (fields.group) villageParts.push(fields.group.endsWith("组") ? fields.group : `${fields.group}组`);
  if (villageParts.length > 0 && !fields.road) {
    if (fields.direction) villageParts.push(fields.direction);
    parts.push(villageParts.join(""));
  }

  // 楼栋房间
  const buildingParts: string[] = [];
  if (fields.building) {
    const b = fields.building;
    // 已含楼/栋/幢/座后缀则不重复补号(避免 16号楼 → 16号楼号);否则去尾号后补号(5号 → 5号)
    buildingParts.push(/[楼栋幢座]$/.test(b) ? b : `${b.replace(/号$/, "")}号`);
  }
  if (fields.unit) buildingParts.push(`${fields.unit.replace(/单元$/, "")}单元`);
  if (fields.floor) buildingParts.push(`${fields.floor.replace(/层$/, "")}层`);
  if (fields.room) {
    const roomBase = fields.room.replace(/室$/, "");
    if (fields.room.endsWith("室") || fields.room.endsWith("号")) {
      buildingParts.push(fields.room);
    } else {
      buildingParts.push(`${roomBase}室`);
    }
  }
  if (buildingParts.length > 0) {
    if (!fields.road && villageParts.length === 0 && fields.direction) buildingParts.push(fields.direction);
    parts.push(buildingParts.join(""));
  }

  return parts.join("");
}
