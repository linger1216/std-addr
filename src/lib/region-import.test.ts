import { describe, expect, it } from "vitest";
import {
  REGION_TYPES,
  flattenRegionJson,
  inferRegionType,
  type RegionJsonOrgNode,
} from "./region-import";

/** 构造一个 org 节点 */
function node(
  orgName: string,
  overrides: Partial<RegionJsonOrgNode> = {},
): RegionJsonOrgNode {
  return {
    orgCode: orgName,
    parentOrgCode: null,
    orgName,
    areaCode: null,
    addressStandardCode: null,
    childList: [],
    ...overrides,
  };
}

describe("flattenRegionJson(region.json → regions 行)", () => {
  it("只保留带标准编码的区划节点,机构节点(无编码)跳过", () => {
    const data = [
      node("闵行区", {
        childList: [
          node("法院"), // 无编码 → 机构
          node("浦江镇", {
            addressStandardCode: "310112114",
            childList: [
              node("聚缘居民委员会", { addressStandardCode: "310112114021" }),
            ],
          }),
        ],
      }),
    ];
    const { items, skipped } = flattenRegionJson(data);
    expect(skipped.uncoded).toBe(2); // 闵行区 + 法院
    expect(items.map((i) => i.name)).toEqual(["浦江镇", "聚缘居民委员会"]);
    expect(items[1]?.parentCode).toBe("310112114");
    expect(items[1]?.level).toBe(2);
    expect(items[1]?.fullName).toBe("浦江镇/聚缘居民委员会");
  });

  it("机构回声:编码与最近保留祖先相同 → 跳过,且不污染层级(parentCode)", () => {
    const data = [
      node("闵行区", {
        childList: [
          node("浦江镇", {
            addressStandardCode: "310112114",
            childList: [
              node("机关科室", { addressStandardCode: "310112114" }), // 回声
              node("社事办", { addressStandardCode: "310112114" }), // 回声
              node("聚缘居民委员会", { addressStandardCode: "310112114021" }),
            ],
          }),
        ],
      }),
    ];
    const { items, skipped } = flattenRegionJson(data);
    expect(skipped.echo).toBe(2);
    expect(items.map((i) => i.name)).toEqual(["浦江镇", "聚缘居民委员会"]);
    expect(items[1]?.parentCode).toBe("310112114");
    expect(items[1]?.level).toBe(2);
  });

  it("重复编码:首个出现保留,后续跳过", () => {
    const data = [
      node("区A", {
        childList: [
          node("七宝镇", { addressStandardCode: "310112102" }),
          node("七宝分中心", { addressStandardCode: "310112102" }), // 重复
        ],
      }),
    ];
    const { items, skipped } = flattenRegionJson(data);
    expect(skipped.duplicate).toBe(1);
    expect(items).toHaveLength(1);
    expect(items[0]?.name).toBe("七宝镇");
  });

  it("带编码但名称非区划(如法院)→ 按名称过滤,整支不产生编码孤儿", () => {
    const data = [
      node("闵行区", {
        childList: [
          node("法院", {
            addressStandardCode: "310112",
            childList: [
              node("执行局", { addressStandardCode: "310112" }), // 回声(祖先未保留 → 变 nameFiltered)
            ],
          }),
        ],
      }),
    ];
    const { items, skipped } = flattenRegionJson(data);
    expect(items).toHaveLength(0);
    expect(skipped.nameFiltered).toBeGreaterThanOrEqual(1);
  });

  it("编码封禁优先于去重:同码后置机构(社区事务受理服务中心)不能顶替占位", () => {
    const data = [
      node("闵行区", {
        childList: [
          node("区开发区管委会", { addressStandardCode: "310112501" }),
          // 名称含"社区"能过特征过滤、也不在名称排除名单 —— 只能靠编码封禁拦住
          node("社区事务受理服务中心", { addressStandardCode: "310112501" }),
          node("浦江镇", { addressStandardCode: "310112114" }),
        ],
      }),
    ];
    const { items, skipped } = flattenRegionJson(data);
    expect(items.map((i) => i.name)).toEqual(["浦江镇"]);
    expect(skipped.nameFiltered).toBe(2);
  });

  it("名称含 管委会/办事处 的机构根(区开发区管委会/莘庄工业区房管办事处)→ 排除,附带编码不占用", () => {
    const data = [
      node("闵行区", {
        childList: [
          node("区开发区管委会", { addressStandardCode: "310112501" }),
          node("莘庄工业区房管办事处", {
            addressStandardCode: "310112",
            childList: [
              node("浦江镇", { addressStandardCode: "310112114" }),
            ],
          }),
        ],
      }),
    ];
    const { items, skipped } = flattenRegionJson(data);
    expect(items.map((i) => i.name)).toEqual(["浦江镇"]);
    expect(items[0]?.parentCode).toBeNull(); // 挂在被排除根下的节点 → 直接落顶级
    expect(skipped.nameFiltered).toBe(2);
  });

  it("未保留中间节点时,孙节点直接挂到最近保留祖先,fullName 不含被跳节点", () => {
    const data = [
      node("闵行区", {
        childList: [
          node("浦锦街道", {
            addressStandardCode: "310112502",
            childList: [
              node("居委会", { childList: [] }), // 机构,无编码
              node("陈行居民委员会", { addressStandardCode: "310112502001" }),
            ],
          }),
        ],
      }),
    ];
    const { items } = flattenRegionJson(data);
    const leaf = items.find((i) => i.code === "310112502001");
    expect(leaf?.parentCode).toBe("310112502");
    // 闵行区无编码不进路径;无编码的「居委会」也被跳过
    expect(leaf?.fullName).toBe("浦锦街道/陈行居民委员会");
  });

  it("顶级节点 parentCode 为 null,level 从 1 开始;同级 sortOrder 按文件顺序", () => {
    const data = [
      node("闵行区", {
        childList: [
          node("乙镇", { addressStandardCode: "310112102" }),
          node("甲镇", { addressStandardCode: "310112101" }),
        ],
      }),
    ];
    const { items } = flattenRegionJson(data);
    expect(items[0]?.parentCode).toBeNull();
    expect(items[0]?.level).toBe(1);
    expect(items.map((i) => i.sortOrder)).toEqual([0, 1]);
  });

  it("空 data → 空结果,无警告", () => {
    const { items, warnings, skipped } = flattenRegionJson([]);
    expect(items).toHaveLength(0);
    expect(warnings).toHaveLength(0);
    expect(skipped).toEqual({ uncoded: 0, echo: 0, duplicate: 0, nameFiltered: 0 });
  });

  it("真正的 region.json 规模:无编码节点全部跳过,编码去重后 parent 均可解析", () => {
    // 规则不变形地跑一遍真实数据的抽取子集即可;完整文件由导入脚本验证
    const data = [
      node("闵行区", {
        childList: [
          node("浦江镇", {
            addressStandardCode: "310112114",
            childList: [
              node("机关科室", {
                addressStandardCode: "310112114",
                childList: [
                  node("社事办", { addressStandardCode: "310112114" }),
                  node("民政事业科", { addressStandardCode: "310112114" }),
                ],
              }),
              node("居(村)委会", {
                addressStandardCode: "310112114",
                childList: [
                  node("聚缘居民委员会", {
                    addressStandardCode: "310112114021",
                  }),
                ],
              }),
            ],
          }),
          node("吴泾镇", {
            addressStandardCode: "310112110",
            childList: [
              node("居(村)委会", {
                addressStandardCode: "310112110",
                childList: [
                  node("永德宝邸居民委员会", {
                    addressStandardCode: "310112110043",
                  }),
                ],
              }),
              node("党政办", { addressStandardCode: "310112110" }),
            ],
          }),
        ],
      }),
    ];
    const { items, skipped, warnings } = flattenRegionJson(data);
    // 浦江镇 + 聚缘居委 + 吴泾镇 + 永德宝邸居委 = 4 个保留
    // (居(村)委会 与父镇编码相同 → 回声跳过,居委直接挂到镇下)
    expect(items.map((i) => i.name)).toEqual([
      "浦江镇",
      "聚缘居民委员会",
      "吴泾镇",
      "永德宝邸居民委员会",
    ]);
    expect(skipped.echo).toBeGreaterThan(0);
    // parentCode 都能在 items 里找到(或为 null)
    const codes = new Set(items.map((i) => i.code));
    for (const item of items) {
      if (item.parentCode !== null) {
        expect(codes.has(item.parentCode)).toBe(true);
      }
    }
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("import 节点会带上推断的 type(与 regions.type 字段对齐)", () => {
    // 节点名需命中 DIVISION_NAME_PATTERN(街道/镇/乡/工业区/社区/里弄/管委会/
    // 居民委员会/村民委员会/居(村)委会/村委会/居委/村委)才会保留,
    // 这就是 region.json 现状:顶层根(如"上海市""闵行区")通常无标准编码被跳过,
    // 小区/省/市/县 在 region.json 树里通常不出现(留给手动编辑补充)。
    const data = [
      node("上海市", {
        addressStandardCode: null, // 顶层无编码 → uncoded
        childList: [
          node("浦江镇", {
            addressStandardCode: "310112114",
            parentOrgCode: null,
            childList: [
              node("聚缘居民委员会", {
                addressStandardCode: "310112114021",
                parentOrgCode: "310112114",
              }),
              node("李巷村委会", {
                addressStandardCode: "310112114022",
                parentOrgCode: "310112114",
              }),
            ],
          }),
          node("浦锦街道", {
            addressStandardCode: "310112502",
            parentOrgCode: null,
          }),
          node("莘庄工业区", {
            addressStandardCode: "310112503",
            parentOrgCode: null,
          }),
          node("某乡", {
            addressStandardCode: "310112504",
            parentOrgCode: null,
          }),
        ],
      }),
    ];
    const { items } = flattenRegionJson(data);
    const byCode = new Map(items.map((i) => [i.code, i]));
    expect(byCode.get("310112114")?.type).toBe("乡镇");
    expect(byCode.get("310112114021")?.type).toBe("居委会");
    expect(byCode.get("310112114022")?.type).toBe("村委会");
    expect(byCode.get("310112502")?.type).toBe("街道");
    expect(byCode.get("310112503")?.type).toBe("开发区"); // 工业区 → 开发区
    expect(byCode.get("310112504")?.type).toBe("乡镇"); // 乡 → 乡镇
    // 所有推断出的 type 都属于 REGION_TYPES
    for (const item of items) {
      if (item.type !== null) {
        expect(REGION_TYPES).toContain(item.type);
      }
    }
  });

  it("含区划特征的顶层根(如「某某街道」)也能推断为街道", () => {
    // 顶层根只要名字命中 DIVISION_NAME_PATTERN 就会保留并推断 type
    // (实际 region.json 顶层通常无标准编码,这条用例只验证 nameFiltered 之后
    // 的路径:type 推断与 items 进入保持一致)
    const data = [
      node("某某街道", {
        addressStandardCode: "999999",
        parentOrgCode: null,
      }),
    ];
    const { items } = flattenRegionJson(data);
    expect(items).toHaveLength(1);
    expect(items[0]?.type).toBe("街道");
  });
});

describe("inferRegionType(名称 → type)", () => {
  it("居委会:居委会 / 居民委员会 / 居(村)委会 / 居委 都能命中", () => {
    expect(inferRegionType("聚缘居委会")).toBe("居委会");
    expect(inferRegionType("聚缘居民委员会")).toBe("居委会");
    expect(inferRegionType("居(村)委会")).toBe("居委会");
    expect(inferRegionType("某居委")).toBe("居委会");
  });

  it("村委会:村委会 / 村民委员会 / 村委", () => {
    expect(inferRegionType("李巷村委会")).toBe("村委会");
    expect(inferRegionType("李巷村民委员会")).toBe("村委会");
    expect(inferRegionType("某村委")).toBe("村委会");
  });

  it("街道/乡镇/小区/开发区", () => {
    expect(inferRegionType("浦锦街道")).toBe("街道");
    expect(inferRegionType("浦江镇")).toBe("乡镇");
    expect(inferRegionType("某乡")).toBe("乡镇");
    expect(inferRegionType("聚缘小区")).toBe("小区");
    expect(inferRegionType("莘庄工业区")).toBe("开发区");
    expect(inferRegionType("闵行开发区")).toBe("开发区");
  });

  it("顶层行政单位:必须以 省/市/区/县/旗 结尾,避免误判", () => {
    expect(inferRegionType("上海市")).toBe("市");
    expect(inferRegionType("江苏省")).toBe("省");
    expect(inferRegionType("闵行区")).toBe("区");
    expect(inferRegionType("某县")).toBe("区"); // 县/旗 一律归"区"
    expect(inferRegionType("某旗")).toBe("区");
    // 含但不以这些字结尾的,不归顶层行政单位(交给更具体的规则兜底)
    expect(inferRegionType("华北区公司")).not.toBe("区");
  });

  it("居委会优先级高于顶层规则(名称里同时含'居委会'和'区')", () => {
    expect(inferRegionType("某某区居委会")).toBe("居委会");
  });

  it("村委会优先级高于乡镇规则(名称里同时含'村委'和'镇')", () => {
    expect(inferRegionType("某某镇村委")).toBe("村委会");
  });

  it("无法识别的名称 → null(交给人工编辑)", () => {
    expect(inferRegionType("聚缘大厦")).toBeNull();
    expect(inferRegionType("")).toBeNull();
    expect(inferRegionType("   ")).toBeNull();
  });
});