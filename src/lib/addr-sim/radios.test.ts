import { describe, expect, it } from "vitest";

import {
  allocateByOrder,
  allocateByWeights,
  computeReallocatedRadios,
  distributeByWeights,
} from "./radios";

describe("distributeByWeights 最大余数法", () => {
  it("均分:1/3 场景修余数,合计恒 100", () => {
    expect(distributeByWeights([1, 1, 1])).toEqual([34, 33, 33]);
  });

  it("按权重比例分配,精确时无舍入", () => {
    expect(distributeByWeights([50, 30, 20])).toEqual([50, 30, 20]);
    expect(distributeByWeights([2, 1])).toEqual([67, 33]);
    expect(distributeByWeights([2, 2, 1])).toEqual([40, 40, 20]);
  });

  it("空数组 / 全零权重 → 空或全 0", () => {
    expect(distributeByWeights([], 100)).toEqual([]);
    expect(distributeByWeights([0, 0], 100)).toEqual([0, 0]);
  });

  it("目标值非 100 时同样精确(合计 = 目标)", () => {
    const result = distributeByWeights([3, 2, 1], 60);
    expect(result).toEqual([30, 20, 10]);
    expect(result.reduce((a, b) => a + b, 0)).toBe(60);
  });

  it("minShare=1:不足下限的槽位从最大份额扣减补足", () => {
    // 权重 [5,4,3,2,1] 分 5:原始最大余数法会给出 [2,1,1,1,0](尾位 0)
    expect(distributeByWeights([5, 4, 3, 2, 1], 5, 1)).toEqual([1, 1, 1, 1, 1]);
    // 权重 [10, 1] 分 5:正常应 [5, 0],下限修正后 [4, 1]
    expect(distributeByWeights([10, 1], 5, 1)).toEqual([4, 1]);
    expect(distributeByWeights([10, 1], 5, 1).reduce((a, b) => a + b, 0)).toBe(5);
  });

  it("随机权重:合计恒等于目标,且每个槽位 >= 0", () => {
    const weights = Array.from({ length: 8 }, () => Math.floor(Math.random() * 20) + 1);
    const result = distributeByWeights(weights, 100, 1);
    expect(result.reduce((a, b) => a + b, 0)).toBe(100);
    expect(result.every((v) => v >= 1)).toBe(true);
  });

  it("预算不足(n×minShare > total):放弃下限,合计恒 100,极小权重可分到 0", () => {
    // 460 条规则各保底 1% = 460% > 100 → 不能保证下限,退回纯权重分配
    const weights = Array.from({ length: 460 }, (_, i) => (i < 5 ? 500 - i * 50 : 1));
    const result = distributeByWeights(weights, 100, 1);
    expect(result).toHaveLength(460);
    expect(result.reduce((a, b) => a + b, 0)).toBe(100);
    // 少数大权重仍拿到正份额
    expect(result[0]!).toBeGreaterThan(0);
    // 大量极小权重(每次只出现 1 次)在此预算下可能分到 0
    expect(result.slice(5).some((v) => v === 0)).toBe(true);
  });
});

describe("allocateByOrder 快速分配(递减权重 N..1)", () => {
  it("3 条分 60% → [30, 20, 10](第一个 > 第二个 > 第三个)", () => {
    expect(allocateByOrder(3, 60)).toEqual([30, 20, 10]);
  });

  it("4 条分 100% → [40, 30, 20, 10]", () => {
    expect(allocateByOrder(4, 100)).toEqual([40, 30, 20, 10]);
  });

  it("2 条分 100% → [67, 33]", () => {
    expect(allocateByOrder(2, 100)).toEqual([67, 33]);
  });

  it("结果严格递减:第 i 个 > 第 i+1 个", () => {
    for (const n of [3, 5, 8]) {
      const shares = allocateByOrder(n, 100);
      for (let i = 0; i < shares.length - 1; i++) {
        expect(shares[i]! > shares[i + 1]!).toBe(true);
      }
      expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
    }
  });

  it("目标小于 n:每个槽位仍 >= 1(从最大份额扣减)", () => {
    expect(allocateByOrder(5, 5)).toEqual([1, 1, 1, 1, 1]);
  });

  it("n <= 0 → 空数组", () => {
    expect(allocateByOrder(0, 60)).toEqual([]);
  });
});

describe("allocateByWeights 导入后重分配(现有占比 + 样本次数)", () => {
  it("合并权重后按比例归一,合计恒 100", () => {
    // 现有 a=50, b=30;新导入 c=20(样本 80 次), d=20(样本 20 次)
    const targets = allocateByWeights([
      { id: "a", weight: 50 },
      { id: "b", weight: 30 },
      { id: "c", weight: 80 },
      { id: "d", weight: 20 },
    ]);
    const sum = Object.values(targets).reduce((a, b) => a + b, 0);
    expect(sum).toBe(100);
    // 权重 20 的新规则占比大于权重 10 的(50+30=80 > 80+20=100 → c 权重 80 最大)
    expect(targets.c!).toBeGreaterThan(targets.a!);
    expect(targets.a!).toBeGreaterThan(targets.b!);
    expect(targets.b!).toBeGreaterThan(targets.d!);
    expect(Object.values(targets).every((v) => v >= 1)).toBe(true);
  });

  it("只有新规则(无现有占比)→ 按次数分 100", () => {
    const targets = allocateByWeights([
      { id: "c", weight: 2 },
      { id: "d", weight: 1 },
    ]);
    expect(targets).toEqual({ c: 67, d: 33 });
  });

  it("空参与者 → 空对象", () => {
    expect(allocateByWeights([])).toEqual({});
  });
});

describe("computeReallocatedRadios 导入后按样本次数公平重算", () => {
  it("A=1000 条(count 300/400/300)+ B=10 条(count 3/3/4)→ A 保持 ~30/40/30,B 各≥1%", () => {
    const targets = computeReallocatedRadios(
      [
        { id: "a1", radio: 30, count: 300 },
        { id: "a2", radio: 40, count: 400 },
        { id: "a3", radio: 30, count: 300 },
      ],
      [
        { id: "b1", count: 3 },
        { id: "b2", count: 3 },
        { id: "b3", count: 4 },
      ],
    );
    // B 的 3 条各保底 1%,A 占 ~97%
    expect(targets.b1!).toBe(1);
    expect(targets.b2!).toBe(1);
    expect(targets.b3!).toBe(1);
    expect(targets.a2!).toBeGreaterThan(targets.a1!);
    expect(targets.a1!).toBeGreaterThan(30 - 3); // A 的占比基本保持
    expect(targets.a2!).toBeGreaterThanOrEqual(36); // minShare 从最大份额(a2)扣减给 B
    expect(Object.values(targets).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("现有规则无 count → 用 radio 兜底", () => {
    const targets = computeReallocatedRadios(
      [{ id: "m", radio: 30, count: null }],
      [{ id: "b", count: 3 }],
    );
    // m 权重 30(radio),b 权重 3 → m≈91,b≈9(或 minShare 修正)
    expect(targets.m!).toBeGreaterThan(50);
    expect(Object.values(targets).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("全部无 count(纯手动/旧数据)→ 按 radio 权重(与旧行为一致)", () => {
    const targets = computeReallocatedRadios(
      [
        { id: "a", radio: 50, count: null },
        { id: "b", radio: 30, count: null },
      ],
      [],
    );
    expect(targets).toEqual({ a: 63, b: 37 });
  });

  it("radio 未设置的规则不参与重算", () => {
    const targets = computeReallocatedRadios(
      [
        { id: "a", radio: 50, count: 500 },
        { id: "x", radio: null, count: 100 }, // 无占比 → 跳过
      ],
      [{ id: "b", count: 500 }],
    );
    expect(targets.x).toBeUndefined();
    expect(Object.values(targets).reduce((a, b) => a + b, 0)).toBe(100);
  });
});