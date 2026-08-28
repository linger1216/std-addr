import { describe, expect, it } from "vitest";
import {
  toForm,
  toSubmit,
  type CommunityDetailLike,
} from "./community-form-mappers";

/** 构造一个详情对象(alias/address 是 JSON 列,类型上为 JsonValue) */
function makeDetail(overrides: Partial<CommunityDetailLike> = {}): CommunityDetailLike {
  return {
    id: "c-1",
    name: "S32小区",
    alias: null,
    regionId: "1374",
    status: 1,
    address: ["富岩路155弄", "富岩路156弄"],
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("toForm(详情/编辑初值 → 表单值)", () => {
  it("无 initial(新建)→ 空表单,地址/别名为空列表", () => {
    const f = toForm(null);
    expect(f.address).toEqual([]);
    expect(f.alias).toEqual([]);
    expect(f.status).toBe(1);
  });

  it("详情 JSON 数组地址 → 逐条展开为表单条目", () => {
    const f = toForm(makeDetail({ address: ["A1", "A2", "A3"] }));
    expect(f.address).toEqual([{ value: "A1" }, { value: "A2" }, { value: "A3" }]);
  });

  it("空地址 → 空条目列表", () => {
    const f = toForm(makeDetail({ address: null }));
    expect(f.address).toEqual([]);
  });

  it("alias(JSON 列)数组 → 条目;字符串 / JSON 字符串 / null 都能归一", () => {
    // 数组形态(新数据)
    expect(toForm(makeDetail({ alias: ["别名A", "别名B"] })).alias).toEqual([
      { value: "别名A" },
      { value: "别名B" },
    ]);
    // 单字符串形态(老数据) → 单条
    expect(toForm(makeDetail({ alias: "别名A" })).alias).toEqual([
      { value: "别名A" },
    ]);
    // JSON 字符串 → 多条
    expect(toForm(makeDetail({ alias: '["别名A","别名B"]' })).alias).toEqual([
      { value: "别名A" },
      { value: "别名B" },
    ]);
    // null → 空
    expect(toForm(makeDetail({ alias: null })).alias).toEqual([]);
  });

  it("JSON 字符串形态的地址(旧提交值)也能解析成条目", () => {
    const f = toForm({
      id: "c-1",
      name: "S32小区",
      alias: '["别名A"]',
      regionId: "1374",
      status: 1,
      address: '["X1","X2"]',
    });
    expect(f.address).toEqual([{ value: "X1" }, { value: "X2" }]);
    expect(f.alias).toEqual([{ value: "别名A" }]);
  });
});

describe("toSubmit(表单值 → 提交值)", () => {
  it("条目列表 → JSON 数组文本(用户无感知)", () => {
    const v = toSubmit({
      id: "c-1",
      name: " S32小区 ",
      alias: [{ value: " 别名A " }, { value: "别名B" }],
      regionId: "1374",
      status: 1,
      address: [{ value: "A1" }, { value: " A2 " }],
    });
    expect(v.name).toBe("S32小区");
    expect(v.alias).toBe('["别名A","别名B"]');
    expect(v.address).toBe('["A1","A2"]');
  });

  it("空条目被过滤;全空列表提交 []", () => {
    const v = toSubmit({
      id: null,
      name: "新小区",
      alias: [],
      regionId: "",
      status: 1,
      address: [{ value: "" }, { value: "   " }, { value: "有效" }],
    });
    expect(v.alias).toBe("[]");
    expect(v.address).toBe('["有效"]');

    const empty = toSubmit({
      id: null,
      name: "新小区",
      alias: [{ value: "" }, { value: "   " }],
      regionId: "",
      status: 1,
      address: [],
    });
    expect(empty.alias).toBe("[]");
    expect(empty.address).toBe("[]");
  });
});