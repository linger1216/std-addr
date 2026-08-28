import { describe, expect, it } from "vitest";
import {
  toForm,
  toSubmit,
  formSchema,
  type PoiDetailLike,
} from "./poi-form-mappers";

/** 构造一个详情对象(alias/address 是 JSON 列) */
function makeDetail(overrides: Partial<PoiDetailLike> = {}): PoiDetailLike {
  return {
    id: "p-1",
    name: "市第一人民医院",
    type: "医院",
    alias: null,
    regionId: "r-1",
    status: 1,
    address: ["XX路100号"],
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("toForm(POI 详情 → 表单值)", () => {
  it("无 initial(新建)→ 空表单,默认启用", () => {
    const f = toForm(null);
    expect(f.name).toBe("");
    expect(f.type).toBe("");
    expect(f.alias).toEqual([]);
    expect(f.address).toEqual([]);
    expect(f.status).toBe(1);
    expect(f.id).toBeNull();
  });

  it("详情 → 表单初值;alias/address 数组/字符串/null 都能归一", () => {
    const f = toForm(makeDetail());
    expect(f.id).toBe("p-1");
    expect(f.name).toBe("市第一人民医院");
    expect(f.type).toBe("医院");
    expect(f.alias).toEqual([]);
    expect(f.address).toEqual([{ value: "XX路100号" }]);

    // alias 数组形态
    const withAlias = toForm(makeDetail({ alias: ["别名A", "别名B"] }));
    expect(withAlias.alias).toEqual([{ value: "别名A" }, { value: "别名B" }]);
    // alias 单字符串(老数据)→ 单条
    expect(toForm(makeDetail({ alias: "别名A" })).alias).toEqual([
      { value: "别名A" },
    ]);
  });

  it("禁用状态正确归一为 0", () => {
    const f = toForm(makeDetail({ status: 0 }));
    expect(f.status).toBe(0);
  });
});

describe("toSubmit(POI 表单值 → 提交值)", () => {
  it("name/type 自动 trim;alias/address 条目去空 + JSON 序列化", () => {
    const v = toSubmit({
      id: "p-1",
      name: " 市第一人民医院 ",
      type: " 医院 ",
      alias: [{ value: "别名A" }, { value: " " }, { value: "别名B" }],
      regionId: "r-1",
      status: 1,
      address: [{ value: "XX路100号" }, { value: "" }],
    });
    expect(v.name).toBe("市第一人民医院");
    expect(v.type).toBe("医院");
    expect(v.alias).toBe('["别名A","别名B"]');
    expect(v.address).toBe('["XX路100号"]');
  });

  it("空 alias/address → 提交 []", () => {
    const v = toSubmit({
      id: null,
      name: "测试POI",
      type: "",
      alias: [],
      regionId: "",
      status: 1,
      address: [{ value: "  " }],
    });
    expect(v.alias).toBe("[]");
    expect(v.address).toBe("[]");
  });
});

describe("formSchema(zod 校验)", () => {
  it("name 必填且 ≤ 100 字", () => {
    expect(
      formSchema.safeParse({ id: null, name: "", type: "", alias: [], regionId: "", status: 1, address: [] }).success,
    ).toBe(false);
    expect(
      formSchema.safeParse({ id: null, name: "测试POI", type: "", alias: [], regionId: "", status: 1, address: [] }).success,
    ).toBe(true);
  });

  it("status 仅接受 0 或 1", () => {
    expect(
      formSchema.safeParse({ id: null, name: "x", type: "", alias: [], regionId: "", status: 2 as unknown as 1, address: [] }).success,
    ).toBe(false);
    expect(
      formSchema.safeParse({ id: null, name: "x", type: "", alias: [], regionId: "", status: 0, address: [] }).success,
    ).toBe(true);
  });
});