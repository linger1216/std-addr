import { describe, expect, it } from "vitest";

import { normalizeChineseDigit, preprocessRaw } from "./preprocess";

describe("preprocessRaw 预处理策略", () => {
  it("去除中文/英文括号及其内容", () => {
    expect(preprocessRaw("闵行区七宝镇（驰骋小区）169号楼")).toBe("闵行区七宝镇169号楼");
    expect(preprocessRaw("闵行区(驰骋小区)169号楼")).toBe("闵行区169号楼");
  });

  it("去除未闭合括号", () => {
    expect(preprocessRaw("闵行区七宝镇（驰骋小区")).toBe("闵行区七宝镇");
  });

  it("去除不可见字符(空格/Tab/换行/xa0/零宽)", () => {
    expect(preprocessRaw("闵行区 七宝镇\t169号楼\n403室")).toBe("闵行区七宝镇169号楼403室");
  });

  it("去除井号", () => {
    expect(preprocessRaw("闵行区#七宝镇#169号楼")).toBe("闵行区七宝镇169号楼");
  });

  it("清理室号前脏字符:402-室 → 402室;1-2室 保留", () => {
    expect(preprocessRaw("华茂路402-室")).toBe("华茂路402室");
    expect(preprocessRaw("华茂路1-2室")).toBe("华茂路1-2室");
  });

  it("清理楼栋前脏字符:楼栋号前接非数字字符时清理(7-号楼 → 7号楼)", () => {
    expect(preprocessRaw("闵行区7-号楼")).toBe("闵行区7号楼");
    // 数字连续("16-号楼")不触发 —— 与旧算法行为一致
    expect(preprocessRaw("闵行区华茂路16-号楼")).toBe("闵行区华茂路16-号楼");
  });

  it("清理单元前脏字符:1-单元 → 1单元", () => {
    expect(preprocessRaw("闵行区华茂路1-单元")).toBe("闵行区华茂路1单元");
  });

  it("清理路号前脏字符:号前接非数字字符时清理(7-号 → 7号)", () => {
    expect(preprocessRaw("新市路7-号")).toBe("新市路7号");
    // 数字连续("1500-号")不触发 —— 与旧算法行为一致
    expect(preprocessRaw("新市路1500-号")).toBe("新市路1500-号");
  });

  it("空/非字符串 → 空串", () => {
    expect(preprocessRaw(null)).toBe("");
    expect(preprocessRaw(undefined)).toBe("");
  });
});

describe("normalizeChineseDigit 中文数字转阿拉伯", () => {
  it("队/组中文字符替换(单字;十不进表,见旧算法)", () => {
    expect(normalizeChineseDigit("三队")).toBe("3队");
    expect(normalizeChineseDigit("十五组")).toBe("十5组");
  });

  it("中文数字串替换:零九八七;注:十/百不在替换表(旧算法一致)", () => {
    expect(normalizeChineseDigit("零九八七")).toBe("0987");
    expect(normalizeChineseDigit("十五组")).toBe("十5组");
  });

  it("空 → 空串", () => {
    expect(normalizeChineseDigit(null)).toBe("");
    expect(normalizeChineseDigit("")).toBe("");
  });
});