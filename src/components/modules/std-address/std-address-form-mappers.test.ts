import { describe, expect, it } from "vitest";

import {
  EMPTY_FORM,
  formSchema,
  toForm,
  toSubmit,
} from "./std-address-form-mappers";

describe("std-address 表单映射", () => {
  it("toForm(null) 返回空表单", () => {
    expect(toForm(null)).toEqual(EMPTY_FORM);
  });

  it("toForm 详情:评分兼容 Decimal 字符串/number,标准地址空归一为空串", () => {
    expect(
      toForm({
        id: "row-1",
        rawAddress: "永跃路260弄38号",
        stdAddress: "上海市闵行区永跃路260弄38号",
        stdScore: "8.5",
        status: 1,
        createdAt: new Date(),
      }),
    ).toEqual({
      id: "row-1",
      rawAddress: "永跃路260弄38号",
      stdAddress: "上海市闵行区永跃路260弄38号",
      stdScore: "8.5",
      status: 1,
    });

    // number 形态 + 无标准地址 + 状态 0
    const form = toForm({
      id: "row-2",
      rawAddress: "革新村",
      stdAddress: null,
      stdScore: 6,
      status: 0,
    });
    expect(form.stdScore).toBe("6");
    expect(form.stdAddress).toBe("");
    expect(form.status).toBe(0);
  });

  it("toSubmit 去除首尾空白", () => {
    expect(
      toSubmit({
        id: null,
        rawAddress: "  永跃路260弄  ",
        stdAddress: "  标准地址  ",
        stdScore: " 7.5 ",
        status: 1,
      }),
    ).toEqual({
      id: null,
      rawAddress: "永跃路260弄",
      stdAddress: "标准地址",
      stdScore: "7.5",
      status: 1,
    });
  });

  it("schema:评分必填时为空允许;非数字 / 越界拒绝", () => {
    // 基准:rawAddress 合法(否则必填校验先行失败)
    const base = { ...EMPTY_FORM, rawAddress: "永跃路260弄38号" };
    expect(formSchema.safeParse({ ...base, stdScore: "" }).success).toBe(true);
    expect(formSchema.safeParse({ ...base, stdScore: "7.5" }).success).toBe(true);
    expect(formSchema.safeParse({ ...base, stdScore: "abc" }).success).toBe(false);
    expect(formSchema.safeParse({ ...base, stdScore: "10.5" }).success).toBe(false);
    expect(formSchema.safeParse({ ...base, stdScore: "-1" }).success).toBe(false);
  });

  it("schema:原始地址必填且最长 500 字", () => {
    expect(formSchema.safeParse({ ...EMPTY_FORM, rawAddress: "" }).success).toBe(false);
    expect(
      formSchema.safeParse({ ...EMPTY_FORM, rawAddress: "a".repeat(501) }).success,
    ).toBe(false);
  });
});