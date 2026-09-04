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

  it("空值被过滤", () => {
    const { whereParts } = buildCommonFilter({ cgType: ["", "  "] });
    expect(whereParts).toEqual([]);
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
    ent("1", "张三", { community: "阳光小区", building: "1栋", room: "101室" }),
    ent("2", "李四", { community: "阳光小区", building: "1栋", room: "101室" }), // 同室
    ent("3", "王五", { community: "阳光小区", building: "1栋", room: "102室" }),
    ent("4", "赵六", { community: "阳光小区", building: "2栋", room: "201室" }),
    ent("5", "钱七", { road: "南京西路", building: "", room: "" }), // 无小区 → 回退 road;无楼栋/室号 → 占位
    ent("6", "孙八", {}), // 全空 → 未分类小区/未编号楼栋/未编号室号
  ];

  it("聚合成 小区 → 楼栋 → 室号 → 人员", () => {
    const tree = buildPersonHouseTree(entries);
    expect(tree.stats.areas).toBe(2); // 阳光小区 / 未分类区域(路名、全空均归入)
    expect(tree.stats.persons).toBe(6);

    const sun = tree.areas.find((c) => c.kind === "community" && c.name === "阳光小区")!;
    expect(sun.buildingCount).toBe(2); // 1栋, 2栋
    expect(sun.personCount).toBe(4);
    const b1 = sun.buildings.find((b) => b.name === "1栋")!;
    expect(b1.roomCount).toBe(2); // 101室, 102室
    const r101 = b1.rooms.find((r) => r.name === "101室")!;
    expect(r101.personCount).toBe(2); // 张三、李四
    expect(r101.persons.map((p) => p.reporter).sort()).toEqual(["张三", "李四"]);

    // 仅路名 / 全空 → 归入「未分类区域」,绝不暴露路名作为小区
    const uncat = tree.areas.find((c) => c.name === "未分类区域")!;
    expect(uncat.kind).toBe("community");
    expect(uncat.personCount).toBe(2); // 钱七(路名) + 孙八(全空)
    expect(uncat.buildings[0]!.name).toBe("未编号楼栋");
    expect(uncat.buildings[0]!.rooms[0]!.name).toBe("未编号室号");
    // 路名不得作为小区名出现
    expect(tree.areas.some((c) => c.name === "南京西路")).toBe(false);
  });

  it("小区按人数降序排列", () => {
    const tree = buildPersonHouseTree(entries);
    expect(tree.areas[0]!.name).toBe("阳光小区"); // 4 人最多
  });

  it("poi / village 暂时隐藏,统一归入未分类区域(路名不得冒充小区)", () => {
    const tree = buildPersonHouseTree([
      ent("1", "甲", { poi: "万达广场", building: "A座", room: "305室" }),
      ent("2", "乙", { village: "王家宅", building: "3号", room: "2室" }),
      ent("3", "丙", { community: "阳光小区", building: "1栋", room: "101室" }),
      // 同名:POI「中心」与 小区「中心」——POI 并入未分类,小区保留
      ent("4", "丁", { poi: "中心", building: "1栋", room: "101室" }),
      ent("5", "戊", { community: "中心", building: "2栋", room: "202室" }),
    ]);
    const kinds = tree.areas.map((a) => `${a.kind}::${a.name}`).sort();
    expect(kinds).toEqual(
      ["community::未分类区域", "community::中心", "community::阳光小区"].sort(),
    );
    // 「中心」只保留小区节点(POI 的并入未分类),故仅 1 个
    expect(tree.areas.filter((a) => a.name === "中心").length).toBe(1);
    // poi / village 名称不得作为区域出现
    expect(tree.areas.some((a) => a.name === "万达广场" || a.name === "王家宅")).toBe(false);
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

