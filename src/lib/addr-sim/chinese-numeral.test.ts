import { describe, expect, it } from "vitest";

import { numberToChinese } from "./chinese-numeral";

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