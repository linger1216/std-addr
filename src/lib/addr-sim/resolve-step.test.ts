import { describe, expect, it } from "vitest";

import type {
  AddrSimLabel,
  AddrSimStep,
  ResolvedAddrSimStep,
} from "@/lib/validators/addr-sim";

import {
  filterValidResolvedSteps,
  isResolvedStepValid,
  normalizeAffix,
  resolveStepWithLabel,
} from "./resolve-step";

const label: AddrSimLabel = {
  name: "路",
  label: "路",
  data: {
    randomValue: { name: "road" },
    randomNumber: { format: "arabic", minDigits: 1, maxDigits: 2 },
  },
  prefix: { texts: ["大"], skipRate: 0 },
};

describe("resolveStepWithLabel 合并", () => {
  it("step 全空 → 完全引用 label 默认", () => {
    const step: AddrSimStep = { name: "路", skipRate: 10 };
    const resolved = resolveStepWithLabel(step, label);
    expect(resolved.data.randomValue?.name).toBe("road");
    expect(resolved.data.randomNumber?.format).toBe("arabic");
    expect(resolved.prefix?.texts).toEqual(["大"]);
    expect(resolved.skipRate).toBe(10);
  });

  it("step.data 部分 override → 覆盖同 key,保留其他 key", () => {
    const step: AddrSimStep = {
      name: "路",
      data: { randomValue: { name: "community" } },
      skipRate: 0,
    };
    const resolved = resolveStepWithLabel(step, label);
    expect(resolved.data.randomValue?.name).toBe("community"); // step 覆盖
    expect(resolved.data.randomNumber?.format).toBe("arabic"); // label 保留
  });

  it("step.prefix 覆盖 label 默认 prefix", () => {
    const step: AddrSimStep = {
      name: "路",
      prefix: { texts: ["老"], skipRate: 10 },
      skipRate: 0,
    };
    const resolved = resolveStepWithLabel(step, label);
    expect(resolved.prefix?.texts).toEqual(["老"]);
  });

  it("label 为空 → data 全空(可能无效)", () => {
    const step: AddrSimStep = { name: "路", skipRate: 0 };
    const resolved = resolveStepWithLabel(step, null);
    expect(resolved.data.randomValue).toBeUndefined();
    expect(isResolvedStepValid(resolved)).toBe(false);
  });

  it("step.data 全空对象 → 引用 label 默认(空=未自定义)", () => {
    const step: AddrSimStep = { name: "路", data: {}, skipRate: 0 };
    const resolved = resolveStepWithLabel(step, label);
    // data {} 为空 → 引用 label.data 默认
    expect(resolved.data.randomValue?.name).toBe("road");
    expect(resolved.data.randomNumber?.format).toBe("arabic");
    expect(isResolvedStepValid(resolved)).toBe(true);
  });

  it("step 未设置 skipRate → 引用 label 默认整体跳过率", () => {
    const labelWithSkip: AddrSimLabel = { ...label, skipRate: 25 };
    const step: AddrSimStep = { name: "路" };
    expect(resolveStepWithLabel(step, labelWithSkip).skipRate).toBe(25);
    // step 显式设置 → 覆盖 label 默认
    expect(resolveStepWithLabel({ name: "路", skipRate: 0 }, labelWithSkip).skipRate).toBe(0);
    expect(resolveStepWithLabel({ name: "路", skipRate: 60 }, labelWithSkip).skipRate).toBe(60);
  });

  it("step/label 均未设置 → 整体跳过率默认 15、干扰率默认 15", () => {
    const resolved = resolveStepWithLabel({ name: "路" }, null);
    expect(resolved.skipRate).toBe(15);
    expect(resolved.noiseRate).toBe(15);
  });

  it("noiseRate 继承 label 默认,步骤可单独覆盖", () => {
    const labelWithNoise: AddrSimLabel = { ...label, noiseRate: 20 };
    expect(resolveStepWithLabel({ name: "路" }, labelWithNoise).noiseRate).toBe(20);
    expect(resolveStepWithLabel({ name: "路", noiseRate: 5 }, labelWithNoise).noiseRate).toBe(5);
  });

  it("affix 未设置 skipRate → 兜底默认 10", () => {
    const labelNoAffixSkip: AddrSimLabel = {
      ...label,
      prefix: { texts: ["大"] },
    };
    expect(resolveStepWithLabel({ name: "路" }, labelNoAffixSkip).prefix?.skipRate).toBe(10);
    // 显式 0 → 保留 0
    expect(resolveStepWithLabel({ name: "路" }, label).prefix?.skipRate).toBe(0);
  });
});

describe("isResolvedStepValid / filterValidResolvedSteps", () => {
  it("至少一个数据源才有效", () => {
    expect(isResolvedStepValid({ name: "路", data: { randomValue: { name: "road" } }, skipRate: 0, noiseRate: 0 })).toBe(true);
    expect(isResolvedStepValid({ name: "路", data: {}, skipRate: 0, noiseRate: 0 })).toBe(false);
  });

  it("过滤无效步骤", () => {
    const steps: ResolvedAddrSimStep[] = [
      { name: "a", data: { randomValue: { name: "road" } }, skipRate: 0, noiseRate: 0 },
      { name: "b", data: {}, skipRate: 0, noiseRate: 0 },
    ];
    expect(filterValidResolvedSteps(steps)).toHaveLength(1);
  });
});

describe("normalizeAffix", () => {
  it("空 texts + 0 跳过率 → undefined", () => {
    expect(normalizeAffix({ texts: [], skipRate: 0 })).toBeUndefined();
  });

  it("有 texts → 保留", () => {
    expect(normalizeAffix({ texts: ["路"], skipRate: 0 })).toEqual({ texts: ["路"], skipRate: 0 });
  });

  it("空对象 → undefined", () => {
    expect(normalizeAffix(undefined)).toBeUndefined();
  });
});