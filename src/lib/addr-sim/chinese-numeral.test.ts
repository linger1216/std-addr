import { describe, expect, it } from "vitest";

import { chineseToNumber, numberToChinese } from "./chinese-numeral";

describe("numberToChinese 数字转中文", () => {
  it("0 返回零", () => {
    expect(numberToChinese(0)).toBe("零");
  });

  it("个位数", () => {
    expect(numberToChinese(1)).toBe("一");
    expect(numberToChinese(5)).toBe("五");
    expect(numberToChinese(9)).toBe("九");
  });

  it("10~19 省略开头的 一", () => {
    expect(numberToChinese(10)).toBe("十");
    expect(numberToChinese(11)).toBe("十一");
    expect(numberToChinese(12)).toBe("十二");
    expect(numberToChinese(19)).toBe("十九");
  });

  it("20~99", () => {
    expect(numberToChinese(20)).toBe("二十");
    expect(numberToChinese(21)).toBe("二十一");
    expect(numberToChinese(99)).toBe("九十九");
  });

  it("100~999 带零补位", () => {
    expect(numberToChinese(100)).toBe("一百");
    expect(numberToChinese(101)).toBe("一百零一");
    expect(numberToChinese(110)).toBe("一百一十");
    expect(numberToChinese(111)).toBe("一百一十一");
    expect(numberToChinese(999)).toBe("九百九十九");
  });

  it("1000~9999 带零补位", () => {
    expect(numberToChinese(1000)).toBe("一千");
    expect(numberToChinese(1001)).toBe("一千零一");
    expect(numberToChinese(1010)).toBe("一千零一十");
    expect(numberToChinese(1011)).toBe("一千零一十一");
    expect(numberToChinese(1100)).toBe("一千一百");
    expect(numberToChinese(9999)).toBe("九千九百九十九");
  });

  it("万段", () => {
    expect(numberToChinese(10000)).toBe("一万");
    expect(numberToChinese(10001)).toBe("一万零一");
    expect(numberToChinese(11000)).toBe("一万一千");
    expect(numberToChinese(10101)).toBe("一万零一百零一");
    expect(numberToChinese(99999)).toBe("九万九千九百九十九");
  });

  it("非法输入抛错", () => {
    expect(() => numberToChinese(-1)).toThrow();
    expect(() => numberToChinese(100000)).toThrow();
    expect(() => numberToChinese(1.5)).toThrow();
    expect(() => numberToChinese(NaN)).toThrow();
  });
});

describe("chineseToNumber 中文转数字", () => {
  it("个位数", () => {
    expect(chineseToNumber("零")).toBe(0);
    expect(chineseToNumber("一")).toBe(1);
    expect(chineseToNumber("两")).toBe(2);
    expect(chineseToNumber("二")).toBe(2);
    expect(chineseToNumber("九")).toBe(9);
  });

  it("10~19", () => {
    expect(chineseToNumber("十")).toBe(10);
    expect(chineseToNumber("十二")).toBe(12);
    expect(chineseToNumber("十九")).toBe(19);
  });

  it("20~99", () => {
    expect(chineseToNumber("二十")).toBe(20);
    expect(chineseToNumber("二十一")).toBe(21);
    expect(chineseToNumber("九十九")).toBe(99);
  });

  it("百位", () => {
    expect(chineseToNumber("一百")).toBe(100);
    expect(chineseToNumber("一百零一")).toBe(101);
    expect(chineseToNumber("一百一十")).toBe(110);
    expect(chineseToNumber("九百九十九")).toBe(999);
  });

  it("千位", () => {
    expect(chineseToNumber("一千")).toBe(1000);
    expect(chineseToNumber("一千零一")).toBe(1001);
    expect(chineseToNumber("一千零一十")).toBe(1010);
    expect(chineseToNumber("九千九百九十九")).toBe(9999);
  });

  it("trim 容忍前后空白", () => {
    expect(chineseToNumber("  二十  ")).toBe(20);
  });

  it("不识别", () => {
    expect(chineseToNumber("")).toBeNull();
    expect(chineseToNumber("   ")).toBeNull();
    expect(chineseToNumber("一万")).toBeNull(); // 万段不支持
    expect(chineseToNumber("一万二千")).toBeNull();
    expect(chineseToNumber("十二万")).toBeNull();
    expect(chineseToNumber("1")).toBeNull(); // 阿拉伯数字不识别
    expect(chineseToNumber("abc")).toBeNull();
    expect(chineseToNumber("一二a")).toBeNull();
    expect(chineseToNumber("第")).toBeNull(); // "第"不是数字字符
  });
});