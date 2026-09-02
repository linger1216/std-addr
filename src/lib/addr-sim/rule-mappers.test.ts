import { describe, expect, it } from "vitest";

import { toRuleRow, toRuleRows, type RuleListRow } from "./rule-mappers";

describe("toRuleRow ruleList → AddrSimRuleRow 映射", () => {
  it("完整字段映射", () => {
    const row: RuleListRow = {
      id: "r1",
      name: "城市-路",
      steps: [{ name: "城市", randomValue: { name: "road" }, skipRate: 0 }],
      radio: 67,
      count: 300,
      total: 1000,
      status: 1,
      updatedAt: "2026-05-10T06:53:07.347Z",
    };
    expect(toRuleRow(row)).toEqual({
      id: "r1",
      name: "城市-路",
      steps: [{ name: "城市", randomValue: { name: "road" }, skipRate: 0 }],
      radio: 67,
      count: 300,
      total: 1000,
      status: 1,
      updatedAt: "2026-05-10T06:53:07.347Z",
    });
  });

  it("steps 非数组 → 空数组;radio/count/total 缺失 → null;status 任意值 → 1(非 0 一律启用)", () => {
    expect(toRuleRow({ id: "r2", name: "x", steps: "oops", status: 5 }).steps).toEqual([]);
    expect(toRuleRow({ id: "r2", name: "x" }).radio).toBeNull();
    expect(toRuleRow({ id: "r2", name: "x" }).count).toBeNull();
    expect(toRuleRow({ id: "r2", name: "x" }).total).toBeNull();
    expect(toRuleRow({ id: "r2", name: "x", status: 5 }).status).toBe(1);
    expect(toRuleRow({ id: "r2", name: "x", status: 0 }).status).toBe(0);
  });

  it("updatedAt 缺失 → null", () => {
    expect(toRuleRow({ id: "r3", name: "y" }).updatedAt).toBeNull();
  });

  it("toRuleRows 批量映射", () => {
    expect(toRuleRows([{ id: "a", name: "A" }, { id: "b", name: "B" }])).toHaveLength(2);
  });
});