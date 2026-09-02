import { describe, expect, it } from "vitest";

import { addrSimRuleCreateSchema, addrSimStepSchema } from "@/lib/validators/addr-sim";

describe("addrSimStepSchema P0-6", () => {
  it("data 可全空(完全引用 label 默认)", () => {
    const s = addrSimStepSchema.parse({
      name: "路",
      skipRate: 0,
    });
    expect(s.name).toBe("路");
    expect(s.data).toBeUndefined();
  });

  it("data 包含 randomValue + randomNumber 多源", () => {
    const s = addrSimStepSchema.parse({
      name: "路",
      data: {
        randomValue: { name: "road" },
        randomNumber: { format: "arabic", minDigits: 1, maxDigits: 4 },
      },
      skipRate: 0,
    });
    expect(s.data?.randomValue?.name).toBe("road");
    expect(s.data?.randomNumber?.format).toBe("arabic");
  });

  it("prefix / suffix 可独立 override", () => {
    const s = addrSimStepSchema.parse({
      name: "路",
      prefix: { texts: ["大"], skipRate: 0 },
      suffix: { texts: ["路"], skipRate: 0 },
      skipRate: 0,
    });
    expect(s.prefix?.texts).toEqual(["大"]);
    expect(s.suffix?.texts).toEqual(["路"]);
  });

  it("空 name → 报错", () => {
    const r = addrSimStepSchema.safeParse({ name: "", skipRate: 0 });
    expect(r.success).toBe(false);
  });

  it("randomNumber 数字位数 minDigits > maxDigits → 报错", () => {
    const r = addrSimStepSchema.safeParse({
      name: "号",
      data: { randomNumber: { format: "arabic", minDigits: 5, maxDigits: 3 } },
      skipRate: 0,
    });
    expect(r.success).toBe(false);
  });
});

describe("addrSimRuleCreateSchema 整体规则", () => {
  it("完整规则可解析", () => {
    const r = addrSimRuleCreateSchema.parse({
      name: "测试规则",
      steps: [
        {
          name: "路",
          data: { randomValue: { name: "road" }, customValue: { list: ["自定义一"] } },
          skipRate: 0,
        },
      ],
      radio: 50,
      status: 1,
    });
    expect(r.steps).toHaveLength(1);
    expect(r.radio).toBe(50);
  });
});
