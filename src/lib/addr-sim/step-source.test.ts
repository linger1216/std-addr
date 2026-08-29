import { describe, expect, it } from "vitest";

import type { AddrSimStep } from "@/lib/validators/addr-sim";

import { DEFAULT_SOURCE_KIND, getSourceKind } from "./step-source";

function baseStep(): AddrSimStep {
  return { name: "路", randomValue: { name: "road" }, skipRate: 0 };
}

describe("getSourceKind 步骤来源判定", () => {
  it("randomValue 优先", () => {
    expect(
      getSourceKind({
        ...baseStep(),
        randomValue: { name: "road" },
        customValue: { list: ["a"] },
      }),
    ).toBe("randomValue");
  });

  it("customValue(当无 randomValue)", () => {
    const s = baseStep();
    delete s.randomValue;
    s.customValue = { list: ["甲"] };
    expect(getSourceKind(s)).toBe("customValue");
  });

  it("randomNumber", () => {
    const s = baseStep();
    delete s.randomValue;
    s.randomNumber = { format: "arabic", minDigits: 1, maxDigits: 3 };
    expect(getSourceKind(s)).toBe("randomNumber");
  });

  it("randomChinese", () => {
    const s = baseStep();
    delete s.randomValue;
    s.randomChinese = { minLength: 2, maxLength: 4 };
    expect(getSourceKind(s)).toBe("randomChinese");
  });

  it("无任何来源 → 默认 randomValue", () => {
    const s = baseStep();
    delete s.randomValue;
    expect(getSourceKind(s)).toBe(DEFAULT_SOURCE_KIND);
  });
});