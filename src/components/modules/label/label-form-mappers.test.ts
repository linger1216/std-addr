import { describe, expect, it } from "vitest";
import { toForm, toSubmit, formSchema, type LabelDetailLike } from "./label-form-mappers";

function makeDetail(overrides: Partial<LabelDetailLike> = {}): LabelDetailLike {
  return {
    id: "l-1",
    name: "province",
    label: "省份",
    status: 1,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("toForm(标签详情 → 表单值)", () => {
  it("无 initial(新建)→ 空表单,状态默认启用", () => {
    const f = toForm(null);
    expect(f.name).toBe("");
    expect(f.label).toBe("");
    expect(f.status).toBe(1);
    expect(f.id).toBeNull();
  });

  it("详情 → 表单初值;label 为 null 时归一为空串", () => {
    const f = toForm(makeDetail({ label: null }));
    expect(f.id).toBe("l-1");
    expect(f.name).toBe("province");
    expect(f.label).toBe("");
    expect(f.status).toBe(1);
  });

  it("禁用状态归 0", () => {
    expect(toForm(makeDetail({ status: 0 })).status).toBe(0);
  });
});

describe("toSubmit(标签表单值 → 提交值)", () => {
  it("name / label 自动 trim", () => {
    const v = toSubmit({ id: null, name: " city ", label: " 城市 ", status: 1 });
    expect(v.name).toBe("city");
    expect(v.label).toBe("城市");
  });

  it("空白 label → 空串(保留,后端区分空 vs 未传)", () => {
    const v = toSubmit({ id: null, name: "x", label: "   ", status: 1 });
    expect(v.label).toBe("");
  });
});

describe("formSchema(zod 校验)", () => {
  it("name 必填且 ≤ 100 字", () => {
    expect(formSchema.safeParse({ id: null, name: "", label: "", status: 1 }).success).toBe(false);
    expect(formSchema.safeParse({ id: null, name: "x".repeat(101), label: "", status: 1 }).success).toBe(false);
    expect(formSchema.safeParse({ id: null, name: "city", label: "", status: 1 }).success).toBe(true);
  });

  it("label 限长 255", () => {
    expect(
      formSchema.safeParse({ id: null, name: "x", label: "y".repeat(256), status: 1 }).success,
    ).toBe(false);
    expect(
      formSchema.safeParse({ id: null, name: "x", label: "标签", status: 1 }).success,
    ).toBe(true);
  });

  it("status 仅接受 0 或 1", () => {
    expect(formSchema.safeParse({ id: null, name: "x", label: "", status: 2 as unknown as 1 }).success).toBe(false);
    expect(formSchema.safeParse({ id: null, name: "x", label: "", status: 1 }).success).toBe(true);
    expect(formSchema.safeParse({ id: null, name: "x", label: "", status: 0 }).success).toBe(true);
  });
});