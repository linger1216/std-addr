import { describe, expect, it } from "vitest";

import { injectNoise } from "./noise";

/** 固定序列 rng:越界返回最后一个 */
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
}

describe("injectNoise 干扰注入", () => {
  it("rate=0 → 原样返回", () => {
    expect(injectNoise("中山路", 0, Math.random)).toBe("中山路");
  });

  it("空串 → 原样返回", () => {
    expect(injectNoise("", 100, Math.random)).toBe("");
  });

  it("未命中概率 → 原样返回(rate=100, rng 首个 < 1 → 命中;rate=50, rng=0.9 → 不命中)", () => {
    // 0.9 * 100 = 90 >= 50 → 未命中
    expect(injectNoise("中山路", 50, seqRng([0.9]))).toBe("中山路");
    // 0.4 * 100 = 40 < 100 → 命中
    expect(injectNoise("中山路", 100, seqRng([0.4, 0, 0]))).not.toBe("中山路");
  });

  it("丢字:命中 + kind=0 → 删掉 index 处字符(少字/漏字)", () => {
    // rng:0(命中)、index=0、kind=0
    expect(injectNoise("中山路", 100, seqRng([0, 0, 0]))).toBe("山路");
  });

  it("相邻互换:kind=1 → index 与 index+1 交换", () => {
    // rng:0(命中)、index=0、kind=1
    expect(injectNoise("中山路", 100, seqRng([0, 0, 0.5]))).toBe("山中路");
  });

  it("错别字:kind=2 且命中形近替换对 → 替换为易错字", () => {
    // rng:0(命中)、index=0、kind=2(字"市"在 TYPO_MAP → "布")
    expect(injectNoise("市府路", 100, seqRng([0, 0, 0.9]))).toBe("布府路");
  });

  it("错别字:无替换对 → 用常用字池替换(rng 取池内下标)", () => {
    // rng:0(命中)、0.5→index=1(字"山",不在 TYPO_MAP)、0.9→kind=2、fallback 下标 rng=0 → "路"
    expect(injectNoise("中山路", 100, seqRng([0, 0.5, 0.9, 0]))).toBe("中路路");
  });

  it("rng 返回 1.0 → 下标收窄到最后一个字符,不越界", () => {
    // rng:0(命中)、1.0→idx=min(3,2)=2、0→kind=0 丢字 → "中山"
    expect(injectNoise("中山路", 100, seqRng([0, 1, 0]))).toBe("中山");
  });
});
