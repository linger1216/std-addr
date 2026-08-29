import { describe, expect, it } from "vitest";

import { parseTagDraft } from "./tag-draft";

describe("parseTagDraft 草稿展开(逗号/JSON 数组)", () => {
  it("空串 / 空白 → []", () => {
    expect(parseTagDraft("")).toEqual([]);
    expect(parseTagDraft("   ")).toEqual([]);
  });

  it("单值 → 单条", () => {
    expect(parseTagDraft("abc")).toEqual(["abc"]);
    expect(parseTagDraft("  abc  ")).toEqual(["abc"]);
  });

  it("英文逗号分隔 → 多条", () => {
    expect(parseTagDraft("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("中文逗号分隔 → 多条", () => {
    expect(parseTagDraft("甲，乙，丙")).toEqual(["甲", "乙", "丙"]);
  });

  it("中英文逗号混合 → 多条", () => {
    expect(parseTagDraft("a，b,c")).toEqual(["a", "b", "c"]);
  });

  it("分隔符周围有空白 → trim 后保留", () => {
    expect(parseTagDraft("  a , b ,  c  ")).toEqual(["a", "b", "c"]);
  });

  it("JSON 数组字符串 → 展开", () => {
    expect(parseTagDraft('["x","y","z"]')).toEqual(["x", "y", "z"]);
    expect(parseTagDraft('["甲","乙"]')).toEqual(["甲", "乙"]);
  });

  it("JSON 数组中数字 / 空白 → 转字符串后 trim", () => {
    expect(parseTagDraft('[1, 2, " 3 "]')).toEqual(["1", "2", "3"]);
  });

  it("JSON 数组里嵌套非字符串元素 → 过滤", () => {
    expect(parseTagDraft('["a", null, "b", "", 3]')).toEqual([
      "a",
      "b",
      "3",
    ]);
  });

  it("JSON 解析为非数组对象 → 退回逗号拆分", () => {
    expect(parseTagDraft('{"a":1}')).toEqual(['{"a":1}']);
  });

  it("JSON 解析失败(以 [ 开头但非法)→ 退回逗号拆分", () => {
    expect(parseTagDraft("[abc,def")).toEqual(["[abc", "def"]);
    expect(parseTagDraft("[1,2,")).toEqual(["[1", "2"]);
  });

  it("JSON 解析失败但不含逗号 → 当作单值", () => {
    expect(parseTagDraft("[abc")).toEqual(["[abc"]);
  });
});