// 重复诉件 / 人房 的纯计算逻辑(不依赖 tRPC / Prisma),便于单测与复用。

/** 构造 cgtype / 发现时间区间 / 关键字 / 街镇 的
 * WHERE 片段与占位参数。全部使用 `?` 占位符 + 参数化(防 SQL 注入),不直接拼接值。
 * 人房关联过滤只用 时间 + 街镇(网格名称 / 案件大类小类子类已移除)。 */
export function buildCommonFilter(input: {
  cgType?: string | string[];
  startDate?: string;
  endDate?: string;
  keyword?: string;
  streetName?: string;
}): { whereParts: string[]; params: unknown[] } {
  const whereParts: string[] = [];
  const params: unknown[] = [];

  if (input.cgType) {
    const types = (Array.isArray(input.cgType) ? input.cgType : [input.cgType])
      .map((t) => String(t).trim())
      .filter(Boolean);
    if (types.length > 0) {
      whereParts.push(`cgtype IN (${types.map(() => "?").join(",")})`);
      params.push(...types);
    }
  }
  if (input.startDate) {
    whereParts.push(`discovertime >= ?`);
    params.push(input.startDate);
  }
  if (input.endDate) {
    whereParts.push(`discovertime <= ?`);
    params.push(input.endDate);
  }
  if (input.keyword) {
    whereParts.push(`(address LIKE ? OR std_address LIKE ?)`);
    params.push(`%${input.keyword}%`, `%${input.keyword}%`);
  }
  const street = input.streetName?.trim();
  if (street) {
    whereParts.push(`streetname LIKE ?`);
    params.push(`%${street}%`);
  }
  return { whereParts, params };
}

/** 把 where 片段包装成 `WHERE ...`(无片段则返回空串) */
export function whereSql(whereParts: string[]): string {
  return whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";
}

/** 由街镇字段推导 town(街道名 → 责任网格 → 未知街镇) */
export function resolveTown(
  streetName?: string | null,
  newWorkGridName?: string | null,
): string {
  const s = streetName?.trim();
  if (s) return s;
  const n = newWorkGridName?.trim();
  if (n) return n;
  return "未知街镇";
}

/** 重复诉件分组的一行(已映射) */
export interface DupGroup {
  groupKey: string;
  address: string;
  stdAddress: string;
  cgType: string;
  month: string; // yyyy-MM
  count: number;
  taskIds: string[];
  discoverDates: string[];
  firstDate: string;
  lastDate: string;
  town: string;
}

/** 按街镇汇总重复诉件 */
export function rollUpByTown(groups: DupGroup[]): TownReport[] {
  const townMap = new Map<string, DupGroup[]>();
  for (const g of groups) {
    const k = g.town || "未知街镇";
    if (!townMap.has(k)) townMap.set(k, []);
    townMap.get(k)!.push(g);
  }
  const towns: TownReport[] = [];
  for (const [town, items] of townMap) {
    const sorted = [...items].sort((a, b) => b.count - a.count);
    const topLocations = sorted.slice(0, 10).map((g) => ({
      address: g.address,
      stdAddress: g.stdAddress,
      cgType: g.cgType,
      maxCount: g.count,
      taskIds: g.taskIds,
    }));
    const typeMap = new Map<string, number>();
    for (const g of items) {
      typeMap.set(g.cgType, (typeMap.get(g.cgType) ?? 0) + g.count);
    }
    const topTypes = [...typeMap.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    towns.push({
      town,
      totalGroups: items.length,
      totalComplaints: items.reduce((s, g) => s + g.count, 0),
      topLocations,
      topTypes,
    });
  }
  towns.sort((a, b) => b.totalComplaints - a.totalComplaints);
  return towns;
}

export interface TownReport {
  town: string;
  totalGroups: number;
  totalComplaints: number;
  topLocations: {
    address: string;
    stdAddress: string;
    cgType: string;
    maxCount: number;
    taskIds: string[];
  }[];
  topTypes: { type: string; count: number }[];
}

/** 人房:非匿名人员一行 */
export interface PersonRow {
  taskId: string;
  reporter: string;
  contactInfo: string;
  address: string;
  stdAddress: string;
  discoverTime: string;
  cgType: string;
  streetName: string;
}

/** 解析出的层级要素(用于人房树分组) */
export interface AddrFields {
  community?: string | null;
  poi?: string | null;
  village?: string | null;
  building?: string | null;
  room?: string | null;
  road?: string | null;
  team?: string | null;
  group?: string | null;
}

export interface PersonHouseEntry {
  person: PersonRow;
  fields: AddrFields;
}

/** 顶级区域类型:小区 / POI / 村 */
export type AreaKind = "community" | "poi" | "village";

export interface RoomNode {
  name: string;
  persons: PersonRow[];
  personCount: number;
}

export interface BuildingNode {
  name: string;
  rooms: RoomNode[];
  roomCount: number;
  personCount: number;
}

/** 村的 队 / 组 单元(平行,无父子从属):队组各自独立成单元,人员直接挂在单元下 */
export interface UnitNode {
  unitKind: "team" | "group";
  name: string;
  persons: PersonRow[];
  personCount: number;
}

export interface AreaNode {
  kind: AreaKind;
  name: string;
  /** 小区:楼栋 → 室号 → 人员 */
  buildings: BuildingNode[];
  buildingCount: number;
  /** 村:队 / 组(平行单元)→ 人员 */
  units: UnitNode[];
  /** POI:人员直接挂区域下,无子元素 */
  persons: PersonRow[];
  roomCount: number;
  /** 本区域去重人员数(村单人在 队/组 各出现一次,此处按 taskId 去重) */
  personCount: number;
}

export interface PersonHouseTree {
  areas: AreaNode[];
  stats: { areas: number; buildings: number; rooms: number; persons: number };
}

/**
 * 把「人员 + 其标准地址要素」聚合成人房树。
 *
 * 区域优先级(顶级):community(小区) > village(村) > poi > 未分类区域。
 *   - 小区:楼栋 → 室号 → 人员(楼栋/室号缺失用占位)。
 *   - 村:队 / 组 平行单元,无父子从属;人员同时挂到其 队 与 组(若两者都有)。
 *     单人有 队 无 组 → 仅挂队;无队无组 → 挂「未编组」。
 *   - POI:人员直接挂区域下,POI 不展开任何下级(无楼栋/室号)。
 *   - 其余(仅 road / 全空)一律归入「未分类区域」,严禁把路名冒充小区。
 *
 * stats:areas=区域数;buildings=小区楼栋数 + 村队组单元数(队组视作"栋"统计);
 * rooms=小区室号数;persons=去重人员总数。
 */
export function buildPersonHouseTree(entries: PersonHouseEntry[]): PersonHouseTree {
  interface AreaAcc {
    kind: AreaKind;
    name: string;
    buildings: Map<string, Map<string, PersonRow[]>>; // building -> room -> persons
    units: Map<string, { kind: "team" | "group"; persons: PersonRow[] }>; // unitName -> persons
    poiPersons: PersonRow[];
    personIds: Set<string>;
  }
  const areaMap = new Map<string, AreaAcc>();

  const getArea = (kind: AreaKind, name: string): AreaAcc => {
    const key = `${kind}::${name}`;
    let a = areaMap.get(key);
    if (!a) {
      a = {
        kind,
        name,
        buildings: new Map(),
        units: new Map(),
        poiPersons: [],
        personIds: new Set(),
      };
      areaMap.set(key, a);
    }
    return a;
  };

  const addPerson = (a: AreaAcc, p: PersonRow) => {
    if (!a.personIds.has(p.taskId)) a.personIds.add(p.taskId);
  };

  for (const { person, fields } of entries) {
    let kind: AreaKind;
    let name: string;
    if (fields.community?.trim()) {
      kind = "community";
      name = fields.community.trim();
    } else if (fields.village?.trim()) {
      kind = "village";
      name = fields.village.trim();
    } else if (fields.poi?.trim()) {
      kind = "poi";
      name = fields.poi.trim();
    } else {
      kind = "community";
      name = "未分类区域";
    }

    const a = getArea(kind, name);
    addPerson(a, person);

    if (kind === "community") {
      /* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
      const b = fields.building?.trim() || "未编号楼栋";
      const r = fields.room?.trim() || "未编号室号";
      /* eslint-enable @typescript-eslint/prefer-nullish-coalescing */
      let bm = a.buildings.get(b);
      if (!bm) {
        bm = new Map();
        a.buildings.set(b, bm);
      }
      let ps = bm.get(r);
      if (!ps) {
        ps = [];
        bm.set(r, ps);
      }
      ps.push(person);
    } else if (kind === "village") {
      const team = fields.team?.trim();
      const group = fields.group?.trim();
      const putUnit = (uKind: "team" | "group", uName: string) => {
        let u = a.units.get(uName);
        if (!u) {
          u = { kind: uKind, persons: [] };
          a.units.set(uName, u);
        }
        u.persons.push(person);
      };
      if (team) putUnit("team", team);
      if (group) putUnit("group", group);
      if (!team && !group) putUnit("team", "未编组");
    } else {
      // poi:人员直接挂区域
      a.poiPersons.push(person);
    }
  }

  const areas: AreaNode[] = [];
  let totalBuildings = 0;
  let totalRooms = 0;
  let totalPersons = 0;

  for (const a of areaMap.values()) {
    const buildings: BuildingNode[] = [];
    let cRooms = 0;
    for (const [bName, rm] of a.buildings) {
      const rooms: RoomNode[] = [];
      for (const [rName, ps] of rm) {
        rooms.push({ name: rName, persons: ps, personCount: ps.length });
        cRooms += 1;
        totalRooms += 1;
      }
      rooms.sort((x, y) => x.name.localeCompare(y.name, "zh"));
      buildings.push({
        name: bName,
        rooms,
        roomCount: rooms.length,
        personCount: rooms.reduce((s, r) => s + r.personCount, 0),
      });
    }
    buildings.sort((x, y) => x.name.localeCompare(y.name, "zh"));

    const units: UnitNode[] = [];
    for (const [uName, u] of a.units) {
      units.push({
        unitKind: u.kind,
        name: uName,
        persons: u.persons,
        personCount: u.persons.length,
      });
    }
    units.sort((x, y) => x.name.localeCompare(y.name, "zh"));

    const personCount = a.personIds.size;
    // 楼栋数统计含小区的楼栋 + 村的队组单元(队组视作"栋")
    const buildingCount = buildings.length + units.length;
    totalBuildings += buildingCount;
    totalPersons += personCount;

    areas.push({
      kind: a.kind,
      name: a.name,
      buildings,
      buildingCount,
      units,
      persons: a.poiPersons,
      roomCount: cRooms,
      personCount,
    });
  }
  areas.sort((x, y) => y.personCount - x.personCount);

  return {
    areas,
    stats: {
      areas: areas.length,
      buildings: totalBuildings,
      rooms: totalRooms,
      persons: totalPersons,
    },
  };
}
