import { describe, expect, it } from "vitest";
import {
  allExpandableCodes,
  collectPathCodes,
  countNodes,
  filterRegionTree,
  findNodeByCode,
  findNodeById,
  regionNodeIcon,
} from "./region-tree-utils";
import type { RegionTreeNode } from "./region-tree";

function makeNode(
  name: string,
  code: string,
  children: RegionTreeNode[] = [],
): RegionTreeNode {
  return {
    id: `id-${code}`,
    code,
    name,
    level: 1,
    type: null,
    alias: null,
    parentCode: null,
    fullName: name,
    sortOrder: 0,
    status: 1,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    children,
  };
}

const tree: RegionTreeNode[] = [
  makeNode("浦江镇", "310112114", [
    makeNode("居(村)委会", "310112114g", [
      makeNode("聚缘居民委员会", "310112114021"),
      makeNode("杜行居民委员会", "310112114002"),
    ]),
    makeNode("机关科室", "310112114j"),
  ]),
  makeNode("吴泾镇", "310112110", [
    makeNode("永德宝邸居民委员会", "310112110043"),
  ]),
];

describe("filterRegionTree(区划树搜索过滤)", () => {
  it("空关键词/纯空白 → 原样返回", () => {
    expect(filterRegionTree(tree, "")).toBe(tree);
    expect(filterRegionTree(tree, "   ")).toBe(tree);
  });

  it("命中叶子 → 保留祖先链,兄弟剪掉", () => {
    const out = filterRegionTree(tree, "聚缘");
    expect(out).toHaveLength(1);
    const town = out[0]!;
    expect(town.name).toBe("浦江镇");
    expect(town.children).toHaveLength(1);
    expect(town.children[0]?.children.map((c) => c.name)).toEqual([
      "聚缘居民委员会",
    ]);
  });

  it("按编码搜索也能命中(居委标准编码)", () => {
    const out = filterRegionTree(tree, "310112110043");
    expect(out).toHaveLength(1);
    expect(out[0]?.name).toBe("吴泾镇");
    expect(out[0]?.children[0]?.name).toBe("永德宝邸居民委员会");
  });

  it("命中中间节点 → 自身保留,不匹配的后代被剪掉", () => {
    const out = filterRegionTree(tree, "居(村)委会");
    expect(out).toHaveLength(1);
    expect(out[0]?.children[0]?.name).toBe("居(村)委会");
    // 后代(聚缘/杜行居委)不包含关键词 → 剪掉
    expect(out[0]?.children[0]?.children).toHaveLength(0);
  });

  it("无命中 → 空数组", () => {
    expect(filterRegionTree(tree, "不存在的名字")).toEqual([]);
  });

  it("大小写不敏感(编码字母场景)", () => {
    const mixed = [makeNode("测试镇", "ABC123")];
    expect(filterRegionTree(mixed, "abc")).toHaveLength(1);
  });
});

describe("树工具(查找/计数/路径/展开集)", () => {
  it("findNodeById / findNodeByCode 递归查找", () => {
    expect(findNodeById(tree, "id-310112114021")?.name).toBe("聚缘居民委员会");
    expect(findNodeByCode(tree, "310112110043")?.name).toBe("永德宝邸居民委员会");
    expect(findNodeById(tree, "nope")).toBeNull();
    expect(findNodeByCode(tree, "nope")).toBeNull();
  });

  it("countNodes 统计子树总数(含自身)", () => {
    expect(countNodes(tree)).toBe(7);
    expect(countNodes(findNodeByCode(tree, "310112114")?.children ?? [])).toBe(4);
  });

  it("collectPathCodes 返回根 → 目标 code 链", () => {
    expect(collectPathCodes(tree, "310112114021")).toEqual([
      "310112114",
      "310112114g",
      "310112114021",
    ]);
    expect(collectPathCodes(tree, "310112114")).toEqual(["310112114"]);
    expect(collectPathCodes(tree, "nope")).toBeNull();
  });

  it("allExpandableCodes 只收集有子节点的 code", () => {
    expect(allExpandableCodes(tree)).toEqual(["310112114", "310112114g", "310112110"]);
  });
});

describe("regionNodeIcon(节点分类图标)", () => {
  it("街道 → street,镇/乡 → town", () => {
    expect(regionNodeIcon("古美路街道")).toBe("street");
    expect(regionNodeIcon("浦江镇")).toBe("town");
    expect(regionNodeIcon("某乡")).toBe("town");
  });

  it("村委会/村民委员会 → village", () => {
    expect(regionNodeIcon("恒星村村委会")).toBe("village");
    expect(regionNodeIcon("陈行村民委员会")).toBe("village");
  });

  it("居委会/居民委员会/居(村)委会 → committee", () => {
    expect(regionNodeIcon("聚缘居民委员会")).toBe("committee");
    expect(regionNodeIcon("永德宝邸居委会")).toBe("committee");
    expect(regionNodeIcon("居(村)委会")).toBe("committee");
  });

  it("其他(机构/未知)→ other", () => {
    expect(regionNodeIcon("机关科室")).toBe("other");
    expect(regionNodeIcon("")).toBe("other");
  });

  it("镇/街道判定优先于村居(名称复合场景)", () => {
    expect(regionNodeIcon("浦锦街道")).toBe("street");
    expect(regionNodeIcon("华漕镇")).toBe("town");
  });
});