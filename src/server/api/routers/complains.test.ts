import { describe, it, expect } from "vitest";

import {
  buildCommonFilter,
  whereSql,
  resolveTown,
  rollUpByTown,
  buildPersonHouseTree,
  type DupGroup,
  type PersonRow,
  type PersonHouseEntry,
} from "./complains-logic";

describe("buildCommonFilter", () => {
  it("空入参 → 无片段", () => {
    const { whereParts, params } = buildCommonFilter({});
    expect(whereParts).toEqual([]);
    expect(params).toEqual([]);
  });

  it("cgtype 数组 → IN (?, ?) 占位", () => {
    const { whereParts, params } = buildCommonFilter({ cgType: ["a", "b"] });
    expect(whereParts).toEqual(["cgtype IN (?,?)"]);
    expect(params).toEqual(["a", "b"]);
  });

  it("cgtype 字符串 → 单值 IN", () => {
    const { whereParts, params } = buildCommonFilter({ cgType: "x" });
    expect(whereParts).toEqual(["cgtype IN (?)"]);
    expect(params).toEqual(["x"]);
  });

  it("时间区间 + 关键字 → 参数化占位", () => {
    const { whereParts, params } = buildCommonFilter({
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      keyword: "路",
    });
    expect(whereParts).toEqual([
      "discovertime >= ?",
      "discovertime <= ?",
      "(address LIKE ? OR std_address LIKE ?)",
    ]);
    expect(params).toEqual([
      "2024-01-01",
      "2024-12-31",
      "%路%",
      "%路%",
    ]);
  });

  it("街镇 → streetname LIKE ? 占位", () => {
    const { whereParts, params } = buildCommonFilter({ streetName: "梅陇镇" });
    expect(whereParts).toEqual(["streetname LIKE ?"]);
    expect(params).toEqual(["%梅陇镇%"]);
  });

  it("空值被过滤", () => {
    const { whereParts } = buildCommonFilter({ cgType: ["", "  "] });
    expect(whereParts).toEqual([]);
  });

  it("人房关联只用 时间 + 街镇(cgtype / 关键字 / 街镇 组合)", () => {
    const { whereParts, params } = buildCommonFilter({
      cgType: "x",
      startDate: "2024-01-01",
      streetName: "梅陇镇",
      keyword: "路",
    });
    expect(whereParts).toEqual([
      "cgtype IN (?)",
      "discovertime >= ?",
      "(address LIKE ? OR std_address LIKE ?)",
      "streetname LIKE ?",
    ]);
    expect(params).toEqual(["x", "2024-01-01", "%路%", "%路%", "%梅陇镇%"]);
  });
});

describe("whereSql", () => {
  it("无片段 → 空串", () => {
    expect(whereSql([])).toBe("");
  });
  it("有片段 → WHERE 连接", () => {
    expect(whereSql(["a = ?", "b = ?"])).toBe("WHERE a = ? AND b = ?");
  });
});

describe("resolveTown", () => {
  it("优先 streetname", () => {
    expect(resolveTown("七宝镇", "网格1")).toBe("七宝镇");
  });
  it("streetname 空 → newworkgridname", () => {
    expect(resolveTown("", "网格1")).toBe("网格1");
  });
  it("都空 → 未知街镇", () => {
    expect(resolveTown(null, null)).toBe("未知街镇");
  });
});

describe("rollUpByTown", () => {
  const groups: DupGroup[] = [
    {
      groupKey: "k1",
      address: "a1",
      stdAddress: "s1",
      cgType: "t1",
      month: "2024-01",
      count: 5,
      taskIds: ["1", "2"],
      discoverDates: ["2024-01-01", "2024-01-10"],
      firstDate: "2024-01-01",
      lastDate: "2024-01-10",
      town: "镇A",
    },
    {
      groupKey: "k2",
      address: "a2",
      stdAddress: "s2",
      cgType: "t2",
      month: "2024-01",
      count: 3,
      taskIds: ["3"],
      discoverDates: ["2024-01-05"],
      firstDate: "2024-01-05",
      lastDate: "2024-01-05",
      town: "镇A",
    },
    {
      groupKey: "k3",
      address: "a3",
      stdAddress: "s3",
      cgType: "t1",
      month: "2024-02",
      count: 10,
      taskIds: ["4", "5", "6"],
      discoverDates: ["2024-02-01"],
      firstDate: "2024-02-01",
      lastDate: "2024-02-01",
      town: "镇B",
    },
  ];

  it("按街镇汇总并排序(按诉件数降序)", () => {
    const towns = rollUpByTown(groups);
    expect(towns.map((t) => t.town)).toEqual(["镇B", "镇A"]);
    const a = towns.find((t) => t.town === "镇A")!;
    expect(a.totalGroups).toBe(2);
    expect(a.totalComplaints).toBe(8);
    expect(a.topLocations).toHaveLength(2);
    // 组内按次数降序
    expect(a.topLocations[0]!.maxCount).toBe(5);
    // topTypes 聚合
    const b = towns.find((t) => t.town === "镇B")!;
    expect(b.topTypes[0]).toEqual({ type: "t1", count: 10 });
  });

  it("空输入 → 空数组", () => {
    expect(rollUpByTown([])).toEqual([]);
  });
});

describe("buildPersonHouseTree", () => {
  const entries: PersonHouseEntry[] = [
    ent("1", "甲", { poi: "万达广场", building: "A座", room: "305室" }), // POI:人员直接挂区域
    ent("2", "乙", { village: "王家宅", team: "1队", group: "3组" }), // 村:队+组 都有
    ent("3", "丙", { village: "王家宅", team: "1队" }), // 村:仅队
    ent("4", "丁", { community: "阳光小区", building: "1栋", room: "101室" }),
    ent("5", "戊", { community: "阳光小区", building: "1栋", room: "101室" }), // 同室
    ent("6", "己", { road: "双柏路" }), // 仅路名 → 未分类区域
  ];

  it("聚合成 小区 / 村 / POI / 未分类 四类区域", () => {
    const tree = buildPersonHouseTree(entries);
    expect(tree.stats.areas).toBe(4); // 阳光小区 / 王家宅 / 万达广场 / 未分类区域
    expect(tree.stats.persons).toBe(6);

    // POI:人员直接挂区域,无楼栋/室号
    const poi = tree.areas.find((a) => a.kind === "poi" && a.name === "万达广场")!;
    expect(poi.persons).toHaveLength(1);
    expect(poi.persons[0]!.reporter).toBe("甲");
    expect(poi.buildings).toHaveLength(0);
    expect(poi.units).toHaveLength(0);

    // 村:队组平行单元,单人在 队/组 各出现一次,区域去重人员数为 2
    const vil = tree.areas.find((a) => a.kind === "village" && a.name === "王家宅")!;
    expect(vil.units.map((u) => `${u.unitKind}::${u.name}`).sort()).toEqual(
      ["group::3组", "team::1队"].sort(),
    );
    // 队「1队」含 乙、丙(2 人);组「3组」含 甲(1 人)
    const t1 = vil.units.find((u) => u.unitKind === "team" && u.name === "1队")!;
    expect(t1.personCount).toBe(2);
    expect(t1.persons.map((p) => p.reporter).sort()).toEqual(["丙", "乙"]);
    const g3 = vil.units.find((u) => u.unitKind === "group" && u.name === "3组")!;
    expect(g3.personCount).toBe(1);
    // 乙 同时带 队+组,故组「3组」下挂的是 乙(甲 属于 POI,不在村)
    expect(g3.persons[0]!.reporter).toBe("乙");
    // 村区域去重人员数 = {乙,丙} = 2
    expect(vil.personCount).toBe(2);
    // 队组计入 buildingCount(stats 把队组视作"栋")
    expect(vil.buildingCount).toBe(2);

    // 小区:楼栋 → 室号 → 人员
    const sun = tree.areas.find((c) => c.kind === "community" && c.name === "阳光小区")!;
    expect(sun.buildingCount).toBe(1);
    expect(sun.roomCount).toBe(1);
    expect(sun.personCount).toBe(2);
    const r101 = sun.buildings[0]!.rooms[0]!;
    expect(r101.name).toBe("101室");
    expect(r101.personCount).toBe(2); // 丁、戊
    expect(r101.persons.map((p) => p.reporter).sort()).toEqual(["丁", "戊"]);

    // 仅路名 → 未分类区域(绝不暴露路名作为小区)
    const uncat = tree.areas.find((c) => c.name === "未分类区域")!;
    expect(uncat.kind).toBe("community");
    expect(uncat.buildingCount).toBe(1); // 未编号楼栋
    expect(tree.areas.some((c) => c.name === "双柏路")).toBe(false);
  });

  it("小区按人数降序排列", () => {
    const tree = buildPersonHouseTree(entries);
    const communities = tree.areas.filter((a) => a.kind === "community");
    expect(communities[0]!.name).toBe("阳光小区"); // 2 人最多
  });

  it("POI / 村 名称作为独立区域出现(不再并入未分类)", () => {
    const tree = buildPersonHouseTree([
      ent("1", "甲", { poi: "万达广场" }),
      ent("2", "乙", { village: "王家宅", team: "2队" }),
      ent("3", "丙", { community: "阳光小区" }),
    ]);
    const names = tree.areas.map((a) => `${a.kind}::${a.name}`).sort();
    expect(names).toEqual(
      ["community::阳光小区", "poi::万达广场", "village::王家宅"].sort(),
    );
  });

  it("仅含路名的地址不能冒充小区", () => {
    const tree = buildPersonHouseTree([
      ent("1", "甲", { road: "双柏路", building: "84号", room: "10楼" }),
      ent("2", "乙", { road: "莲花路" }),
    ]);
    expect(tree.areas).toHaveLength(1);
    expect(tree.areas[0]!.name).toBe("未分类区域");
    expect(tree.areas[0]!.kind).toBe("community");
  });

  it("增量合并(前端分页累积 entries 后重建)与一次性 build 结果一致", () => {
    const page1 = entries.slice(0, 3);
    const page2 = entries.slice(3);

    // 模拟前端:逐页累积 entries,每页 build 一次
    let acc: PersonHouseEntry[] = [];
    let incremental: ReturnType<typeof buildPersonHouseTree> | null = null;
    for (const page of [page1, page2]) {
      acc = [...acc, ...page];
      incremental = buildPersonHouseTree(acc);
    }
    // 一次性 build
    const once = buildPersonHouseTree(entries);

    expect(incremental!.stats.areas).toBe(once.stats.areas);
    expect(incremental!.stats.persons).toBe(once.stats.persons);
    expect(incremental!.stats.buildings).toBe(once.stats.buildings);
    expect(incremental!.stats.rooms).toBe(once.stats.rooms);
    expect(
      incremental!.areas
        .map((a) => `${a.kind}::${a.name}`)
        .sort(),
    ).toEqual(
      once.areas
        .map((a) => `${a.kind}::${a.name}`)
        .sort(),
    );
  });

  it("空输入 → 空树", () => {
    expect(buildPersonHouseTree([])).toEqual({
      areas: [],
      stats: { areas: 0, buildings: 0, rooms: 0, persons: 0 },
    });
  });
});

function ent(
  taskId: string,
  reporter: string,
  fields: PersonHouseEntry["fields"],
): PersonHouseEntry {
  const row: PersonRow = {
    taskId,
    reporter,
    contactInfo: "",
    address: "",
    stdAddress: "",
    discoverTime: "",
    cgType: "",
    streetName: "",
  };
  return { person: row, fields };
}
