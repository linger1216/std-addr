import { describe, expect, it } from "vitest";

import {
  EMPTY_FORM,
  formSchema,
  formatScoreInput,
  toForm,
  toSubmit,
} from "./std-address-form-mappers";

describe("std-address 表单映射", () => {
  it("toForm(null) 返回空表单(27 要素全空串)", () => {
    const f = toForm(null);
    expect(f).toEqual(EMPTY_FORM);
    expect(f.province).toBe("");
    expect(f.room).toBe("");
  });

  it("toForm 详情:标准地址空归一为空串,要素 null → 空串,评分不进表单", () => {
    const form = toForm({
      id: "row-2",
      rawAddress: "革新村",
      stdAddress: null,
      stdScore: 6,
      status: 0,
      province: "上海市",
      room: null,
    });
    expect(form.stdAddress).toBe("");
    expect(form.status).toBe(0);
    expect(form.province).toBe("上海市");
    expect(form.room).toBe("");
    // stdScore 不进入表单值(评分只读,由标准化自动计算)
    expect("stdScore" in form).toBe(false);
  });

  it("toSubmit 去除首尾空白;要素空串 → null(清空)", () => {
    const r = toSubmit({
      id: null,
      rawAddress: "  永跃路260弄  ",
      stdAddress: "  标准地址  ",
      status: 1,
      province: "  上海市  ",
      road: "",
      room: null,
    });
    expect(r.rawAddress).toBe("永跃路260弄");
    expect(r.stdAddress).toBe("标准地址");
    expect(r.province).toBe("上海市");
    expect(r.road).toBeNull();
    expect(r.room).toBeNull();
  });

  it("schema:27 要素可空、最长 100 字", () => {
    const base = { ...EMPTY_FORM, rawAddress: "永跃路260弄38号" };
    // 要素空串合法
    expect(formSchema.safeParse({ ...base, province: "" }).success).toBe(true);
    // 要素空白合法(trim 后为空)
    expect(formSchema.safeParse({ ...base, province: "   " }).success).toBe(true);
    // 要素超长拒绝
    expect(
      formSchema.safeParse({ ...base, province: "a".repeat(101) }).success,
    ).toBe(false);
  });

  it("schema:原始地址必填且最长 500 字", () => {
    expect(formSchema.safeParse({ ...EMPTY_FORM, rawAddress: "" }).success).toBe(false);
    expect(
      formSchema.safeParse({ ...EMPTY_FORM, rawAddress: "a".repeat(501) }).success,
    ).toBe(false);
  });

  it("formatScoreInput:兼容 Decimal 的 string/number,null → 空串", () => {
    expect(formatScoreInput("8.50")).toBe("8.5");
    expect(formatScoreInput(6)).toBe("6");
    expect(formatScoreInput(null)).toBe("");
    expect(formatScoreInput(undefined)).toBe("");
  });
});