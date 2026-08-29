import { describe, expect, it } from "vitest";
import {
  parseAliasEntries,
  dedupAliases,
} from "./alias-entries";

describe("parseAliasEntries(别名 JSON → 字符串数组)", () => {
  it("null / undefined / 空串 → []", () => {
    expect(parseAliasEntries(null)).toEqual([]);
    expect(parseAliasEntries(undefined)).toEqual([]);
    expect(parseAliasEntries("")).toEqual([]);
    expect(parseAliasEntries("   ")).toEqual([]);
  });

  it("字符串 → 单条", () => {
    expect(parseAliasEntries("别名A")).toEqual(["别名A"]);
  });

  it("JSON 字符串 → 数组", () => {
    expect(parseAliasEntries('["别名A","别名B"]')).toEqual(["别名A", "别名B"]);
  });

  it("数组 → 展平、过滤空串与非字符串", () => {
    expect(parseAliasEntries(["别名A", "别名B"])).toEqual(["别名A", "别名B"]);
    expect(parseAliasEntries(["别名A", "", "别名B"])).toEqual(["别名A", "别名B"]);
    expect(parseAliasEntries(["别名A", 123, null, "别名B"])).toEqual([
      "别名A",
      "123",
      "别名B",
    ]);
  });

  it("JSON 字符串里嵌数组(嵌套)→ 展平", () => {
    expect(parseAliasEntries('[["别名A","别名B"],["别名C"]]')).toEqual([
      "别名A",
      "别名B",
      "别名C",
    ]);
  });

  it("数字 / 布尔 / 对象 → 归一化或空", () => {
    expect(parseAliasEntries(123)).toEqual(["123"]);
    expect(parseAliasEntries(true)).toEqual(["true"]);
    expect(parseAliasEntries({ a: 1 })).toEqual([]);
  });
});

describe("dedupAliases(去空 + 去重)", () => {
  it("空值会被过滤", () => {
    expect(dedupAliases([{ value: "" }, { value: "   " }])).toEqual([]);
  });

  it("重复值保留首次出现,后续过滤", () => {
    expect(
      dedupAliases([{ value: "a" }, { value: "b" }, { value: "a" }, { value: "b" }]),
    ).toEqual([{ value: "a" }, { value: "b" }]);
  });

  it("trim 后判等", () => {
    expect(dedupAliases([{ value: " a " }, { value: "a" }])).toEqual([
      { value: "a" },
    ]);
  });

  it("保持顺序", () => {
    expect(dedupAliases([{ value: "c" }, { value: "a" }, { value: "b" }]))
      .toEqual([{ value: "c" }, { value: "a" }, { value: "b" }]);
  });
});

