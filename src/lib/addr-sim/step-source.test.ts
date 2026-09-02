import { describe, expect, it } from "vitest";

import type { AddrSimStep } from "@/lib/validators/addr-sim";

import { DEFAULT_SOURCE_KIND, getSourceKind } from "./step-source";

function baseStep(): AddrSimStep {
  return { name: "路", data: { randomValue: { name: "road" } }, skipRate: 0 };
}

describe("getSourceKind 数据来源判定", () => {
  it("randomValue 优先(data.randomValue 存在)", () => {
    expect(
      getSourceKind({
        ...baseStep(),
        data: { randomValue: { name: "road" }, customValue: { list: ["a"] } },
      }),
    ).toBe("randomValue");
  });

  it("无 randomValue 但有 customValue", () => {
    expect(
      getSourceKind({ ...baseStep(), data: { customValue: { list: ["a"] } } }),
    ).toBe("customValue");
  });

  it("无 randomValue/customValue 但有 randomNumber", () => {
    expect(
      getSourceKind({
        ...baseStep(),
        data: { randomNumber: { format: "arabic", minDigits: 1, maxDigits: 4 } },
      }),
    ).toBe("randomNumber");
  });

  it("无 randomValue/customValue/randomNumber 但有 randomChinese", () => {
    expect(
      getSourceKind({
        ...baseStep(),
        data: { randomChinese: { minLength: 2, maxLength: 4 } },
      }),
    ).toBe("randomChinese");
  });

  it("data 为空 → 默认 randomValue", () => {
    expect(getSourceKind({ ...baseStep(), data: {} })).toBe(DEFAULT_SOURCE_KIND);
  });

  it("data 字段不存在 → 默认 randomValue", () => {
    const s = baseStep();
    delete s.data;
    expect(getSourceKind(s)).toBe(DEFAULT_SOURCE_KIND);
  });
});
