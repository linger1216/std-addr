import { describe, expect, it } from "vitest";

import { migrateLabelData, migrateStep, parseLabelConfig } from "./migrate";

describe("migrateLabelData 旧字母 key → 语义 key", () => {
  it("WIP 格式 {A,B,C,D} → randomValue/customValue/randomNumber/randomChinese", () => {
    const r = migrateLabelData({
      A: { name: "road" },
      B: { list: ["1", "2"] },
      C: { format: "arabic", minDigits: 1, maxDigits: 4 },
      D: { minLength: 2, maxLength: 4 },
    });
    expect(r).toEqual({
      randomValue: { name: "road" },
      customValue: { list: ["1", "2"] },
      randomNumber: { format: "arabic", minDigits: 1, maxDigits: 4 },
      randomChinese: { minLength: 2, maxLength: 4 },
    });
  });

  it("已是新格式 → 原样透传", () => {
    const r = migrateLabelData({ randomValue: { name: "village" } });
    expect(r?.randomValue?.name).toBe("village");
  });

  it("null / 非对象 → undefined", () => {
    expect(migrateLabelData(null)).toBeUndefined();
    expect(migrateLabelData(undefined)).toBeUndefined();
    expect(migrateLabelData("x")).toBeUndefined();
    expect(migrateLabelData([1])).toBeUndefined();
  });
});

describe("parseLabelConfig 统一配置(数据源 + 前后缀 + 跳过率)", () => {
  it("解析统一 data:4 源 + prefix/suffix + skipRate + noiseRate", () => {
    const r = parseLabelConfig({
      randomNumber: { format: "arabic", minDigits: 1, maxDigits: 4 },
      prefix: { texts: ["大"], skipRate: 30 },
      suffix: { texts: ["号"], skipRate: 60 },
      skipRate: 25,
      noiseRate: 20,
    });
    expect(r?.randomNumber?.maxDigits).toBe(4);
    expect(r?.prefix).toEqual({ texts: ["大"], skipRate: 30 });
    expect(r?.suffix).toEqual({ texts: ["号"], skipRate: 60 });
    expect(r?.skipRate).toBe(25);
    expect(r?.noiseRate).toBe(20);
  });

  it("兼容旧字母 key + 旧 affix text 单值", () => {
    const r = parseLabelConfig({
      A: { name: "road" },
      suffix: { text: "号", skipRate: 30 },
    });
    expect(r?.randomValue?.name).toBe("road");
    expect(r?.suffix).toEqual({ texts: ["号"], skipRate: 30 });
  });

  it("null / 非对象 → undefined", () => {
    expect(parseLabelConfig(null)).toBeUndefined();
    expect(parseLabelConfig("x")).toBeUndefined();
  });
});

describe("migrateStep 规则步骤旧格式迁移", () => {
  it("旧格式:来源 key 在步骤顶层 → 收拢进 data", () => {
    const r = migrateStep({
      name: "路",
      randomValue: { name: "road" },
      customValue: { list: ["甲"] },
      skipRate: 20,
    });
    expect(r).toEqual({
      name: "路",
      data: {
        randomValue: { name: "road" },
        customValue: { list: ["甲"] },
      },
      skipRate: 20,
    });
  });

  it("WIP 格式:data.{A,B,C,D} → 语义 key", () => {
    const r = migrateStep({
      name: "号",
      data: { A: { name: "road" }, C: { format: "arabic", minDigits: 1, maxDigits: 3 } },
      skipRate: 0,
    });
    expect(r.data?.randomValue?.name).toBe("road");
    expect(r.data?.randomNumber?.maxDigits).toBe(3);
    expect(r.data?.customValue).toBeUndefined();
  });

  it("旧 affix text 单值 → texts 数组(保留 skipRate)", () => {
    const r = migrateStep({
      name: "路",
      prefix: { text: "大", skipRate: 30 },
      suffix: { text: "路", skipRate: 0 },
      skipRate: 0,
    });
    expect(r.prefix).toEqual({ texts: ["大"], skipRate: 30 });
    expect(r.suffix).toEqual({ texts: ["路"], skipRate: 0 });
  });

  it("丢弃旧 mode 字段", () => {
    const r = migrateStep({
      name: "路",
      mode: "merged",
      randomValue: { name: "road" },
      skipRate: 0,
    });
    expect(r).not.toHaveProperty("mode");
    expect(r.data?.randomValue?.name).toBe("road");
  });

  it("新格式 → 原样保留(含 data 语义 key + texts affix)", () => {
    const r = migrateStep({
      name: "室号",
      data: { randomNumber: { format: "arabic", minDigits: 3, maxDigits: 4 } },
      suffix: { texts: ["室"], skipRate: 60 },
      skipRate: 0,
    });
    expect(r.data?.randomNumber?.maxDigits).toBe(4);
    expect(r.suffix).toEqual({ texts: ["室"], skipRate: 60 });
  });
});
