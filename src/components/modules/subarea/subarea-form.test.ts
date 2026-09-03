import { describe, expect, it } from "vitest";
import {
  toForm,
  toSubmit,
  type SubareaDetailLike,
} from "./subarea-form-mappers";

/** 构造一个详情对象(alias/address 是 JSON 列,类型上为 JsonValue) */
function makeDetail(overrides: Partial<SubareaDetailLike> = {}): SubareaDetailLike {
  return {
    id: "c-1",
    name: "S32子区域",
    alias: null,
    regionId: "1374",
    status: 1,
    address: ["富岩路155弄", "富岩路156弄"],
    property: { building: ["1", "3"], floor: ["2"] },
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

  it("关联实体(类型+id)落到表单初值;缺省为空串", () => {
    const f = toForm(
      makeDetail({ entityType: "community", entityId: "recom-1" }),
    );
    expect(f.entityType).toBe("community");
    expect(f.entityId).toBe("recom-1");
    // 老数据无 entity 字段 → 未关联
    const old = toForm(makeDetail({ entityType: null, entityId: null }));
    expect(old.entityType).toBe("");
    expect(old.entityId).toBe("");
    expect(toForm(null).entityType).toBe("");
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
      name: "S32子区域",
      alias: '["别名A"]',
      regionId: "1374",
      status: 1,
      address: '["X1","X2"]',
      property: '{"building":["1"]}',
    });
    expect(f.address).toEqual([{ value: "X1" }, { value: "X2" }]);
    expect(f.alias).toEqual([{ value: "别名A" }]);
  });
});

describe("toSubmit(表单值 → 提交值)", () => {
  it("条目列表 → JSON 数组文本(用户无感知)", () => {
    const v = toSubmit({
      id: "c-1",
      name: " S32子区域 ",
      alias: [{ value: " 别名A " }, { value: "别名B" }],
      regionId: "1374",
      status: 1,
      address: [{ value: "A1" }, { value: " A2 " }],
      property: [
        { key: " building ", values: [{ value: "1" }, { value: "A" }, { value: " " }] },
        { key: "", values: [{ value: "x" }] },
        { key: "bad", values: [] },
      ],
    });
    expect(v.name).toBe("S32子区域");
    expect(v.alias).toBe('["别名A","别名B"]');
    expect(v.address).toBe('["A1","A2"]');
    expect(v.property).toBe('{"building":["1","A"]}');
  });

  it("空条目被过滤;全空列表提交 []", () => {
    const v = toSubmit({
      id: null,
      name: "新子区域",
      alias: [],
      regionId: "",
      entityType: "",
      entityId: "",
      status: 1,
      address: [{ value: "" }, { value: "   " }, { value: "有效" }],
      property: [],
    });
    expect(v.alias).toBe("[]");
    expect(v.address).toBe('["有效"]');
    expect(v.property).toBe('{}');

    const empty = toSubmit({
      id: null,
      name: "新子区域",
      alias: [{ value: "" }, { value: "   " }],
      regionId: "",
      status: 1,
      address: [],
      property: [{ key: "  ", values: [{ value: "" }] }],
    });
    expect(empty.alias).toBe("[]");
    expect(empty.address).toBe("[]");
    expect(empty.property).toBe('{}');
  });

  it("关联实体(trim 后成对提交;空类型/空 id 按空串 = 未关联)", () => {
    const linked = toSubmit({
      id: "c-1",
      name: "子区域",
      alias: [],
      regionId: "",
      entityType: " community ",
      entityId: " recom-9 ",
      status: 1,
      address: [],
      property: [],
    });
    expect(linked.entityType).toBe("community");
    expect(linked.entityId).toBe("recom-9");

    const none = toSubmit({
      id: null,
      name: "子区域",
      alias: [],
      regionId: "",
      entityType: "",
      entityId: "",
      status: 1,
      address: [],
      property: [],
    });
    expect(none.entityType).toBe("");
    expect(none.entityId).toBe("");
  });
});

describe("property 属性映射", () => {
  it("详情 property 对象 → key+值条目(toForm)", () => {
    const f = toForm(makeDetail({ property: { building: ["1", "3", "A"], floor: ["2"] } }));
    expect(f.property).toEqual([
      { key: "building", values: [{ value: "1" }, { value: "3" }, { value: "A" }] },
      { key: "floor", values: [{ value: "2" }] },
    ]);
  });

  it("property 值为非数组 → 单值条目", () => {
    const f = toForm(makeDetail({ property: { type: "办公" } }));
    expect(f.property).toEqual([{ key: "type", values: [{ value: "办公" }] }]);
  });

  it("property 空/非法 → 空条目列表", () => {
    expect(toForm(makeDetail({ property: null })).property).toEqual([]);
    expect(toForm(makeDetail({ property: "not-json" })).property).toEqual([]);
  });

  it("toSubmit:空 key / 空值整行丢弃;trim 后序列化对象", () => {
    const v = toSubmit({
      id: null,
      name: "属性测试",
      alias: [],
      regionId: "",
      status: 1,
      address: [],
      property: [
        { key: " building ", values: [{ value: " 1 " }, { value: "B" }] },
        { key: "empty", values: [] },
        { key: "", values: [{ value: "x" }] },
      ],
    });
    expect(v.property).toBe('{"building":["1","B"]}');
  });
});