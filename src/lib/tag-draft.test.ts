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

  describe("N->M 范围展开", () => {
    it("阿拉伯升序 1->9 → 9 条阿拉伯数字", () => {
      expect(parseTagDraft("1->9")).toEqual([
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

    it("中文升序 一->二十 → 20 条中文", () => {
      const out = parseTagDraft("一->二十");
      expect(out).toHaveLength(20);
      expect(out[0]).toBe("一");
      expect(out[19]).toBe("二十");
      expect(out[9]).toBe("十");
      expect(out[10]).toBe("十一");
    });

    it("阿拉伯降序 9->1 也展开", () => {
      expect(parseTagDraft("9->1")).toEqual([
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

    it("混合逗号与范围 a,1->3,b → a + 1/2/3 + b", () => {
      expect(parseTagDraft("a,1->3,b")).toEqual(["a", "1", "2", "3", "b"]);
    });

    it("范围语法两端允许空白 1 -> 3", () => {
      expect(parseTagDraft("1 -> 3")).toEqual(["1", "2", "3"]);
    });

    it("混合格式不展开,按字面字符串保留 1->二十", () => {
      expect(parseTagDraft("1->二十")).toEqual(["1->二十"]);
    });

    it("超长范围不展开,保留原串(防止 UI 卡顿)", () => {
      expect(parseTagDraft("1->10000")).toEqual(["1->10000"]);
    });

    it("JSON 数组里含 N->M 字符串也展开", () => {
      expect(parseTagDraft('["1->3","x"]')).toEqual(["1", "2", "3", "x"]);
    });
  });
});