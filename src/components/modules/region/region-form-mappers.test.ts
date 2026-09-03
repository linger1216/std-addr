import { describe, expect, it } from "vitest";
import {
  flattenParentOptions,
  regionFormSchema,
  toForm,
  toSubmit,
  type RegionTreeNode,
} from "./region-form-mappers";

function makeNode(overrides: Partial<RegionTreeNode> & { code: string }): RegionTreeNode {
  return {
    id: `id-${overrides.code}`,
    name: overrides.code,
    level: 1,
    type: null,
    alias: null,
    parentCode: null,
    fullName: overrides.code,
    sortOrder: 0,
    status: 1,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    children: [],
    ...overrides,
  };
}

describe("toForm / toSubmit(区划表单映射)", () => {
  it("无节点 → 新建默认值(顶级/启用/排序 0)", () => {
    const f = toForm(null);
    expect(f.name).toBe("");
    expect(f.parentCode).toBe("");
    expect(f.sortOrder).toBe("0");
    expect(f.status).toBe(1);
  });

  it("节点 → 表单值;null 字段归一为空串", () => {
    const f = toForm(
      makeNode({
        code: "310112114",
        name: "浦江镇",
        parentCode: "310112",
        type: "镇",
        sortOrder: 3,
        status: 0,
      }),
    );
    expect(f).toMatchObject({
      name: "浦江镇",
      code: "310112114",
      type: "镇",
      parentCode: "310112",
      sortOrder: "3",
      status: 0,
    });
  });

  it("提交值:空串 parentCode/type → undefined,sortOrder 转数字,别名序列化为 JSON 文本", () => {
    const v = toSubmit({
      name: " 浦江镇 ",
      code: " 310112114 ",
      type: " ",
      alias: [{ value: "旧名" }, { value: " 俗称 " }, { value: "" }],
      parentCode: "",
      sortOrder: "5",
      status: 1,
    });
    expect(v).toEqual({
      name: "浦江镇",
      code: "310112114",
      type: undefined,
      // 去空 + 去首尾空格后序列化成数组 JSON
      alias: JSON.stringify(["旧名", "俗称"]),
      parentCode: undefined,
      sortOrder: 5,
      status: 1,
    });
  });

  it("schema:名称/编码必填,排序只收数字", () => {
    expect(regionFormSchema.safeParse({ name: "", code: "x", alias: [], status: 1 }).success).toBe(false);
    expect(regionFormSchema.safeParse({ name: "x", code: "", alias: [], status: 1 }).success).toBe(false);
    expect(regionFormSchema.safeParse({ name: "x", code: "x", alias: [], sortOrder: "12a", status: 1 }).success).toBe(false);
    expect(regionFormSchema.safeParse({ name: "x", code: "x", alias: [], sortOrder: "12", status: 0 }).success).toBe(true);
  });
});

describe("flattenParentOptions(上级下拉选项)", () => {
  const tree: RegionTreeNode[] = [
    makeNode({
      code: "root",
      name: "闵行区",
      children: [
        makeNode({ code: "t1", name: "浦江镇", parentCode: "root", children: [
          makeNode({ code: "t1c1", name: "聚缘居民委员会", parentCode: "t1" }),
        ] }),
        makeNode({ code: "t2", name: "吴泾镇", parentCode: "root" }),
      ],
    }),
  ];

  it("无排除 → 平铺全部节点,label 用 fullName", () => {
    const opts = flattenParentOptions(tree);
    expect(opts.map((o) => o.value)).toEqual(["root", "t1", "t1c1", "t2"]);
    // t1c1 未单独传 fullName 时回退 name;补传后应显示完整路径
    const rich = flattenParentOptions([
      makeNode({
        code: "root",
        fullName: "闵行区",
        children: [
          makeNode({
            code: "t1",
            fullName: "闵行区/浦江镇",
            children: [
              makeNode({ code: "t1c1", fullName: "闵行区/浦江镇/聚缘居民委员会" }),
            ],
          }),
        ],
      }),
    ]);
    expect(rich[2]?.label).toBe("闵行区/浦江镇/聚缘居民委员会");
  });

  it("编辑时排除自身与后代,防止挂到自己子节点下", () => {
    const opts = flattenParentOptions(tree, "t1");
    const values = opts.map((o) => o.value);
    expect(values).not.toContain("t1");
    expect(values).not.toContain("t1c1");
    expect(values).toContain("root");
    expect(values).toContain("t2");
  });

  it("不存在/顶级编辑:排除自身;顶级节点(根)排除后无剩余选项", () => {
    const opts = flattenParentOptions(tree, "nope");
    expect(opts).toHaveLength(4);
    const rootOpts = flattenParentOptions(tree, "root");
    expect(rootOpts).toHaveLength(0); // 根的直接后代全是其子树,顶级不能再选父级
  });
});