// 重复诉件 / 人房 的纯计算逻辑(不依赖 tRPC / Prisma),便于单测与复用。

/** 构造 cgtype / 发现时间区间 / 关键字 / 街镇 / 网格名称 的 WHERE 片段与占位参数。
 * 全部使用 `?` 占位符 + 参数化(防 SQL 注入),不直接拼接值。 */
export function buildCommonFilter(input: {
  cgType?: string | string[];
  startDate?: string;
  endDate?: string;
  keyword?: string;
  streetName?: string;
  gridName?: string;
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
  const grid = input.gridName?.trim();
  if (grid) {
    whereParts.push(`newworkgridname LIKE ?`);
    params.push(`%${grid}%`);
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

export interface AreaNode {
  kind: AreaKind;
  name: string;
  buildings: BuildingNode[];
  buildingCount: number;
  roomCount: number;
  personCount: number;
}

export interface PersonHouseTree {
  areas: AreaNode[];
  stats: { areas: number; buildings: number; rooms: number; persons: number };
}

/**
 * 把「人员 + 其标准地址要素」聚合成 区域(小区) → 楼栋 → 室号 → 人员 的树。
 *
 * 顶级区域仅取 ML 识别的 community(小区)。poi / village 暂时不展示;无 community
 * 的(仅有 road / poi / village / 空)统一归入「未分类区域」,严禁把路名冒充小区
 * (原先 "无社区则回退 road" 的逻辑已移除 —— 真实数据中大量地址只有路名,会误显示为小区)。
 * 楼栋=building,室号=room;缺失用占位。
 */
export function buildPersonHouseTree(entries: PersonHouseEntry[]): PersonHouseTree {
  const commMap = new Map<
    string,
    Map<string, Map<string, PersonRow[]>>
  >();

  for (const { person, fields } of entries) {
    // 仅 community 作为区域节点;其余一律归入「未分类区域」(路名不得冒充小区)
    const c = fields.community?.trim()
      ? `community::${fields.community.trim()}`
      : `community::未分类区域`;
    /* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
    // 楼栋/室号缺失或为空串时回退占位(空串也算缺失,故用 || 而非 ??)
    const b = fields.building?.trim() || "未编号楼栋";
    const r = fields.room?.trim() || "未编号室号";
    /* eslint-enable @typescript-eslint/prefer-nullish-coalescing */
    let bm = commMap.get(c);
    if (!bm) {
      bm = new Map();
      commMap.set(c, bm);
    }
    let rm = bm.get(b);
    if (!rm) {
      rm = new Map();
      bm.set(b, rm);
    }
    let ps = rm.get(r);
    if (!ps) {
      ps = [];
      rm.set(r, ps);
    }
    ps.push(person);
  }

  const areas: AreaNode[] = [];
  let totalBuildings = 0;
  let totalRooms = 0;
  let totalPersons = 0;

  for (const [cKey, bm] of commMap) {
    const sep = cKey.indexOf("::");
    const kind = cKey.slice(0, sep) as AreaKind;
    const cName = cKey.slice(sep + 2);
    const buildings: BuildingNode[] = [];
    let cRooms = 0;
    let cPersons = 0;
    for (const [bName, rm] of bm) {
      const rooms: RoomNode[] = [];
      for (const [rName, ps] of rm) {
        rooms.push({ name: rName, persons: ps, personCount: ps.length });
        cRooms += 1;
        cPersons += ps.length;
        totalRooms += 1;
        totalPersons += ps.length;
      }
      rooms.sort((a, b) => a.name.localeCompare(b.name, "zh"));
      buildings.push({
        name: bName,
        rooms,
        roomCount: rooms.length,
        personCount: cPersons,
      });
      totalBuildings += 1;
    }
    buildings.sort((a, b) => a.name.localeCompare(b.name, "zh"));
    areas.push({
      kind,
      name: cName,
      buildings,
      buildingCount: buildings.length,
      roomCount: cRooms,
      personCount: cPersons,
    });
  }
  areas.sort((a, b) => b.personCount - a.personCount);

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
