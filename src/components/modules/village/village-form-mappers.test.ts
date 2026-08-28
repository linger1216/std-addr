import { describe, expect, it } from "vitest";
import {
  toForm,
  toSubmit,
  formSchema,
  type VillageDetailLike,
} from "./village-form-mappers";

/** 构造一个详情对象(alias 是 JSON 列,DB 输出 Prisma.JsonValue,类型上为 unknown) */
function makeDetail(overrides: Partial<VillageDetailLike> = {}): VillageDetailLike {
  return {
    id: "v-1",
    name: "上杭村",
    alias: null,
    regionId: "r-1",
    status: 1,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("toForm(村详情 → 表单值)", () => {
  it("无 initial(新建)→ 空表单,alias 为空数组,状态默认启用", () => {
    const f = toForm(null);
    expect(f.name).toBe("");
    expect(f.alias).toEqual([]);
    expect(f.regionId).toBe("");
    expect(f.status).toBe(1);
    expect(f.id).toBeNull();
  });

  it("详情 → 表单初值;alias/regionId 为 null 时归一为空", () => {
    const f = toForm(makeDetail());
    expect(f.id).toBe("v-1");
    expect(f.name).toBe("上杭村");
    expect(f.alias).toEqual([]);
    expect(f.regionId).toBe("r-1");
    expect(f.status).toBe(1);
  });

  it("禁用状态正确归一为 0", () => {
    const f = toForm(makeDetail({ status: 0 }));
    expect(f.status).toBe(0);
  });

  it("alias 是 JSON 列:数组 / 字符串 / JSON 字符串都能解析为条目", () => {
    // 数组形态
    expect(toForm(makeDetail({ alias: ["别名A", "别名B"] })).alias).toEqual([
      { value: "别名A" },
      { value: "别名B" },
    ]);
    // 单字符串 → 单条
    expect(toForm(makeDetail({ alias: "别名A" })).alias).toEqual([
      { value: "别名A" },
    ]);
    // JSON 字符串 → 多条
    expect(toForm(makeDetail({ alias: '["别名A","别名B"]' })).alias).toEqual([
      { value: "别名A" },
      { value: "别名B" },
    ]);
    // 空数组 / null → 空
    expect(toForm(makeDetail({ alias: [] })).alias).toEqual([]);
    expect(toForm(makeDetail({ alias: null })).alias).toEqual([]);
  });
});

describe("toSubmit(村表单值 → 提交值)", () => {
  it("name 自动 trim;alias 条目去空 + 序列化为 JSON 数组", () => {
    const v = toSubmit({
      id: "v-1",
      name: " 上杭村 ",
      alias: [{ value: "别名A" }, { value: " 别名B " }, { value: "" }, { value: "   " }],
      regionId: "r-1",
      status: 1,
    });
    expect(v.name).toBe("上杭村");
    expect(v.alias).toBe('["别名A","别名B"]');
  });

  it("空 alias → 空数组提交 []", () => {
    const v = toSubmit({
      id: null,
      name: "上杭村",
      alias: [{ value: "" }, { value: "   " }],
      regionId: "",
      status: 1,
    });
    expect(v.alias).toBe("[]");

    const empty = toSubmit({
      id: null,
      name: "上杭村",
      alias: [],
      regionId: "",
      status: 1,
    });
    expect(empty.alias).toBe("[]");
  });
});

describe("formSchema(zod 校验)", () => {
  it("name 必填且 ≤ 100 字", () => {
    expect(
      formSchema.safeParse({
        id: null,
        name: "",
        alias: [],
        regionId: "",
        status: 1,
      }).success,
    ).toBe(false);
    expect(
      formSchema.safeParse({
        id: null,
        name: "x".repeat(101),
        alias: [],
        regionId: "",
        status: 1,
      }).success,
    ).toBe(false);
    expect(
      formSchema.safeParse({
        id: null,
        name: "上杭村",
        alias: [],
        regionId: "",
        status: 1,
      }).success,
    ).toBe(true);
  });

  it("alias 是条目数组,每条 value 限长 100", () => {
    expect(
      formSchema.safeParse({
        id: null,
        name: "x",
        alias: [{ value: "y".repeat(101) }],
        regionId: "",
        status: 1,
      }).success,
    ).toBe(false);
    expect(
      formSchema.safeParse({
        id: null,
        name: "x",
        alias: [{ value: "OK" }],
        regionId: "",
        status: 1,
      }).success,
    ).toBe(true);
  });

  // 上限 20 条由 AliasTagInput 的 max 控制,不在 schema 层校验;
  // schema 只保证条目结构合法(空条目由 toSubmit 去空,过长由 TagInput 限制)
  it("alias 条目结构:任意数量均通过 schema", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ value: `a${i}` }));
    expect(
      formSchema.safeParse({ id: null, name: "x", alias: many, regionId: "", status: 1 })
        .success,
    ).toBe(true);
  });

  it("status 仅接受 0 或 1", () => {
    expect(
      formSchema.safeParse({
        id: null,
        name: "x",
        alias: [],
        regionId: "",
        status: 2 as unknown as 1,
      }).success,
    ).toBe(false);
    expect(
      formSchema.safeParse({ id: null, name: "x", alias: [], regionId: "", status: 1 }).success,
    ).toBe(true);
    expect(
      formSchema.safeParse({ id: null, name: "x", alias: [], regionId: "", status: 0 }).success,
    ).toBe(true);
  });
});
