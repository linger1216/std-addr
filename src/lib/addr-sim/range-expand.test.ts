import { describe, expect, it } from "vitest";

import { RANGE_MAX_LIMIT, tryExpandRange } from "./range-expand";

describe("tryExpandRange N->M 范围展开", () => {
  it("阿拉伯升序 1->9", () => {
    expect(tryExpandRange("1->9")).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
    ]);
  });

  it("阿拉伯起点 = 终点", () => {
    expect(tryExpandRange("5->5")).toEqual(["5"]);
  });

  it("阿拉伯降序 9->1", () => {
    expect(tryExpandRange("9->1")).toEqual([
      "9",
      "8",
      "7",
      "6",
      "5",
      "4",
      "3",
      "2",
      "1",
    ]);
  });

  it("中文升序 一->二十", () => {
    // 重点场景:输出全部为中文
    expect(tryExpandRange("一->二十")).toEqual([
      "一",
      "二",
      "三",
      "四",
      "五",
      "六",
      "七",
      "八",
      "九",
      "十",
      "十一",
      "十二",
      "十三",
      "十四",
      "十五",
      "十六",
      "十七",
      "十八",
      "十九",
      "二十",
    ]);
  });

  it("中文降序 二十->一", () => {
    const expanded = tryExpandRange("二十->一");
    expect(expanded).not.toBeNull();
    expect(expanded![0]).toBe("二十");
    expect(expanded![expanded!.length - 1]).toBe("一");
    expect(expanded).toHaveLength(20);
  });

  it("中文含零 一百零一->一百一十", () => {
    const expanded = tryExpandRange("一百零一->一百一十");
    expect(expanded).toEqual([
      "一百零一",
      "一百零二",
      "一百零三",
      "一百零四",
      "一百零五",
      "一百零六",
      "一百零七",
      "一百零八",
      "一百零九",
      "一百一十",
    ]);
  });

  it("支持「两」作为「二」别名", () => {
    expect(tryExpandRange("两->五")).toEqual(["二", "三", "四", "五"]);
  });

  it("trim 容忍两端空白", () => {
    expect(tryExpandRange("  1 -> 3  ")).toEqual(["1", "2", "3"]);
    expect(tryExpandRange(" 一 -> 三 ")).toEqual(["一", "二", "三"]);
  });

  it("混合格式 1->二十 不展开,返回 null(让调用方原样保留)", () => {
    expect(tryExpandRange("1->二十")).toBeNull();
    expect(tryExpandRange("一->9")).toBeNull();
  });

  it("超出 RANGE_MAX_LIMIT 不展开", () => {
    // 长度 = 10000,刚好超过 9999
    expect(tryExpandRange("1->10000")).toBeNull();
    expect(tryExpandRange(`1->${RANGE_MAX_LIMIT + 1}`)).toBeNull();
  });

  it("RANGE_MAX_LIMIT 自身 1->9999 仍可展开", () => {
    const expanded = tryExpandRange("1->9999");
    expect(expanded).not.toBeNull();
    expect(expanded).toHaveLength(9999);
    expect(expanded![0]).toBe("1");
    expect(expanded![9998]).toBe("9999");
  });

  it("单个数字 5->5 也算范围,产出 1 项", () => {
    expect(tryExpandRange("5->5")).toEqual(["5"]);
  });

  it("非范围语法(普通字符串)返回 null", () => {
    expect(tryExpandRange("abc")).toBeNull();
    expect(tryExpandRange("一号公路")).toBeNull();
    expect(tryExpandRange("123")).toBeNull();
    expect(tryExpandRange("")).toBeNull();
    expect(tryExpandRange("   ")).toBeNull();
  });

  it("使用「-」而非「->」不算范围语法,返回 null", () => {
    expect(tryExpandRange("1-9")).toBeNull();
  });

  it("「->」出现多次(如链式范围)不算,返回 null", () => {
    expect(tryExpandRange("1->2->3")).toBeNull();
  });

  it("一边为空(只输入了「->」)返回 null", () => {
    expect(tryExpandRange("->5")).toBeNull();
    expect(tryExpandRange("5->")).toBeNull();
    expect(tryExpandRange("->")).toBeNull();
  });

  it("阿拉伯超过 9999(端点非法)返回 null", () => {
    expect(tryExpandRange("99999->1")).toBeNull();
    expect(tryExpandRange("-1->5")).toBeNull(); // 含负号,无法识别
  });
});