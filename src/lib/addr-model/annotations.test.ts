import { describe, expect, it } from "vitest";

import { buildAnnotations, findUnusedPosition, splitFieldValue } from "./annotations";
import { ADDR_FIELDS, FIELD_KEY_TO_ZH } from "./fields";

describe("buildAnnotations 标注分片", () => {
  it("普通地址:字段值整体命中,按原文位置输出", () => {
    const full = "闵行区华茂路32弄17号";
    const out = buildAnnotations(full, {
      district: "闵行区",
      road: "华茂路",
      lane: "32弄",
    });
    expect(out.map((a) => a.matched)).toEqual([true, true, true]);
    expect(out.map((a) => a.label)).toEqual(["区县", "路", "弄"]);
    expect(out.map((a) => a.text)).toEqual(["闵行区", "华茂路", "32弄"]);
    expect(out.map((a) => a.start)).toEqual([0, 3, 6]);
    expect(out.map((a) => a.end)).toEqual([3, 6, 9]);
  });

  it("逗号合并字段:按子串拆开逐段匹配(社区=两段全命中)", () => {
    const full = "闵行区七宝镇航华二村三街坊169号楼403室（驰骋小区）";
    const out = buildAnnotations(full, {
      district: "闵行区",
      street: "七宝镇",
      community: "航华二村三街坊,驰骋小区",
      building: "169号楼",
      room: "403室",
    });
    // 全部字段至少一个片段;community 拆成两段
    expect(out.every((a) => a.matched)).toBe(true);
    expect(out.filter((a) => a.label === "小区")).toHaveLength(2);
    expect(out.map((a) => a.label)).toEqual(["区县", "街道", "小区", "楼栋", "室号", "小区"]);
  });

  it("字段值与原文写法不同(整体与子串都未命中)→ 降级 unmatched 放末尾", () => {
    const full = "上海市新市路1500号";
    const out = buildAnnotations(full, {
      district: "闵行区", // 原文没有
      road: "新市路",
    });
    expect(out[0]).toMatchObject({ text: "新市路", label: "路", matched: true });
    expect(out[1]).toMatchObject({ text: "闵行区", label: "区县", matched: false });
  });

  it("重叠片段跳过已占用位置(同值字段避免重复标记)", () => {
    const full = "华茂路32弄";
    // 两个字段都是 "华茂路"(模型错误输出),只允许第一个占用
    const out = buildAnnotations(full, { road: "华茂路", lane: "华茂路" });
    const matched = out.filter((a) => a.matched);
    expect(matched).toHaveLength(1);
  });

  it("空字段值跳过", () => {
    const out = buildAnnotations("abc", { district: "", road: null });
    expect(out).toEqual([]);
  });
});

describe("splitFieldValue 子串拆分", () => {
  it("逗号/中文标点/空格拆分并过滤空", () => {
    expect(splitFieldValue("航华二村三街坊,驰骋小区")).toEqual([
      "航华二村三街坊",
      "驰骋小区",
    ]);
    expect(splitFieldValue("A、B；C D")).toEqual(["A", "B", "C", "D"]);
  });

  it("无分隔符 → 原样单段", () => {
    expect(splitFieldValue("新市路")).toEqual(["新市路"]);
  });
});

describe("findUnusedPosition 占用跳过", () => {
  it("已占用位置跳到下一个出现处;无更多返回 -1", () => {
    const used = new Set<number>([0]);
    expect(findUnusedPosition("华茂路华茂路", "华茂路", used)).toBe(3);
    expect(findUnusedPosition("华茂路", "华茂路", new Set([0]))).toBe(-1);
  });
});

describe("fields 字典一致性", () => {
  it("27 个要素全部,且每个都有模型 key 映射", () => {
    expect(ADDR_FIELDS).toHaveLength(27);
    const zhSet = new Set(Object.values(FIELD_KEY_TO_ZH));
    for (const zh of ADDR_FIELDS) {
      expect(zhSet.has(zh)).toBe(true);
    }
  });
});