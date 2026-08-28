import { describe, expect, it } from "vitest";
import { toForm, toSubmit, formSchema, type RoadDetailLike } from "./road-form-mappers";

function makeDetail(overrides: Partial<RoadDetailLike> = {}): RoadDetailLike {
  return {
    id: "r-1",
    road: "中山大道",
    status: 1,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("toForm(道路详情 → 表单值)", () => {
  it("无 initial(新建)→ 空表单,状态默认启用", () => {
    const f = toForm(null);
    expect(f.road).toBe("");
    expect(f.status).toBe(1);
    expect(f.id).toBeNull();
  });

  it("详情 → 表单初值;禁用状态归 0", () => {
    const f = toForm(makeDetail());
    expect(f.id).toBe("r-1");
    expect(f.road).toBe("中山大道");
    expect(f.status).toBe(1);
    expect(toForm(makeDetail({ status: 0 })).status).toBe(0);
  });
});

describe("toSubmit(道路表单值 → 提交值)", () => {
  it("road 自动 trim", () => {
    const v = toSubmit({ id: null, road: " 中山大道 ", status: 1 });
    expect(v.road).toBe("中山大道");
  });
});

describe("formSchema(zod 校验)", () => {
  it("road 必填且 ≤ 100 字", () => {
    expect(formSchema.safeParse({ id: null, road: "", status: 1 }).success).toBe(false);
    expect(formSchema.safeParse({ id: null, road: "x".repeat(101), status: 1 }).success).toBe(false);
    expect(formSchema.safeParse({ id: null, road: "中山大道", status: 1 }).success).toBe(true);
  });

  it("status 仅接受 0 或 1", () => {
    expect(formSchema.safeParse({ id: null, road: "x", status: 2 as unknown as 1 }).success).toBe(false);
    expect(formSchema.safeParse({ id: null, road: "x", status: 1 }).success).toBe(true);
    expect(formSchema.safeParse({ id: null, road: "x", status: 0 }).success).toBe(true);
  });
});