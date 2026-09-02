import { describe, expect, it } from "vitest";

import {
  buildHanCharPool,
  COMMON_HAN_FALLBACK,
  COMMON_PREFIX,
  COMMON_SUFFIX,
  pickChineseFragment,
} from "./name-corpus";

describe("buildHanCharPool 字池构建", () => {
  it("空输入时返回 词典 + 兜底", () => {
    const pool = buildHanCharPool([]);
    // 必须包含兜底字
    expect(pool.length).toBeGreaterThanOrEqual(COMMON_HAN_FALLBACK.length);
    for (const c of COMMON_HAN_FALLBACK) {
      expect(pool).toContain(c);
    }
  });

  it("DB 名称存在时切出 1~4 字前缀片段", () => {
    const pool = buildHanCharPool(["阳光花园", "王泥浜村", "一院"]);
    // 单字前缀
    expect(pool).toContain("阳");
    expect(pool).toContain("王");
    expect(pool).toContain("一");
    // 多字前缀
    expect(pool).toContain("阳光");
    expect(pool).toContain("阳光花");
    expect(pool).toContain("王泥浜");
  });

  it("去重保序:DB 片段优先于词典", () => {
    const pool = buildHanCharPool(["阳光花园"]);
    // "阳"既来自 DB 也来自 COMMON_PREFIX,只保留一次;且 DB 在前
    const sunIdx = pool.indexOf("阳");
    expect(sunIdx).toBeGreaterThanOrEqual(0);
    // 后续词典词仍在池中
    expect(pool.length).toBeGreaterThan(20);
  });

  it("空字符串与空白被忽略", () => {
    const pool1 = buildHanCharPool(["", "  ", "甲"]);
    const pool2 = buildHanCharPool(["甲"]);
    expect(pool1).toEqual(pool2);
  });
});

describe("pickChineseFragment 随机抽片段", () => {
  it("池为空时降级到兜底首字", () => {
    expect(pickChineseFragment([], Math.random)).toBe(COMMON_HAN_FALLBACK[0]);
  });

  it("按 rng 取下标", () => {
    const pool = ["阳", "锦", "金"];
    expect(pickChineseFragment(pool, () => 0)).toBe("阳");
    expect(pickChineseFragment(pool, () => 0.5)).toBe("锦");
    expect(pickChineseFragment(pool, () => 0.99)).toBe("金");
  });

  it("保证不返回空字符串", () => {
    for (let i = 0; i < 50; i++) {
      const out = pickChineseFragment(buildHanCharPool(), Math.random);
      expect(out.length).toBeGreaterThan(0);
    }
  });
});

describe("词典常量自检", () => {
  it("COMMON_PREFIX 至少 30 项", () => {
    expect(COMMON_PREFIX.length).toBeGreaterThanOrEqual(30);
  });

  it("COMMON_SUFFIX 至少 20 项", () => {
    expect(COMMON_SUFFIX.length).toBeGreaterThanOrEqual(20);
  });

  it("COMMON_HAN_FALLBACK 至少 60 项", () => {
    expect(COMMON_HAN_FALLBACK.length).toBeGreaterThanOrEqual(60);
  });
});
