import { describe, expect, it } from "vitest";
import { stripVillageSuffix } from "./village-name";

describe("stripVillageSuffix(村委会节点 → 具体村名)", () => {
  it("村民委员会 / 村委会 / 村委 都剥成不带后缀的村名", () => {
    expect(stripVillageSuffix("李巷村民委员会")).toBe("李巷");
    expect(stripVillageSuffix("李巷村委会")).toBe("李巷");
    expect(stripVillageSuffix("李巷村委")).toBe("李巷");
  });

  it("最长后缀优先剥除:村民委员会 不会被 村委 提前剥", () => {
    expect(stripVillageSuffix("某村村民委员会")).toBe("某村");
  });

  it("兜底剥到 村", () => {
    expect(stripVillageSuffix("某村")).toBe("某");
  });

  it("无匹配后缀 → 原样返回", () => {
    expect(stripVillageSuffix("李巷")).toBe("李巷");
  });

  it("空字符串 → 空字符串", () => {
    expect(stripVillageSuffix("")).toBe("");
  });
});
