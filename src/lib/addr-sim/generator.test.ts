import { describe, expect, it } from "vitest";

import type {
  ResolvedAddrSimStep,
} from "@/lib/validators/addr-sim";

import {
  generateAddress,
  generateDataset,
  generateForRules,
  generateStepValue,
  pickOne,
  previewStepValues,
  toLabelStudioExported,
  computeCountsByRatios,
  shuffleArray,
  type CandidatePool,
} from "./generator";

/** 固定序列 rng:每次调用依次返回给定值,越界后返回最后一个 */
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
}

const pool: CandidatePool = {
  road: ["新市路", "中山路", "人民路"],
  community: ["春华苑", "阳光花园"],
  village: ["华漕村", "王泥浜村"],
  poi: ["一院", "中心广场"],
};

/** 构造 resolved step(P0-6 形态:data 必有值,rate 已兜底) */
function resolvedStep(
  overrides: Partial<ResolvedAddrSimStep> = {},
): ResolvedAddrSimStep {
  return {
    name: "路",
    data: { randomValue: { name: "road" } },
    skipRate: 0,
    noiseRate: 0,
    ...overrides,
  };
}

describe("pickOne 随机取一", () => {
  it("空数组返回 null", () => {
    expect(pickOne([], Math.random)).toBeNull();
  });

  it("按 rng 下标取值", () => {
    expect(pickOne(["a", "b", "c"], seqRng([0]))).toBe("a");
    expect(pickOne(["a", "b", "c"], seqRng([0.99]))).toBe("c");
  });
});

describe("generateStepValue 单步取值(P0-6 randomValue/customValue/randomNumber/randomChinese 独立抽 1)", () => {
  it("randomValue(实体表):从表候选值取一个", () => {
    const step = resolvedStep({ data: { randomValue: { name: "road" } } });
    const ctx = { rng: seqRng([0.4]), candidates: pool };
    expect(generateStepValue(step, ctx)).toBe("中山路");
  });

  it("任取其一:randomValue 候选池为空 → 环形尝试 customValue", () => {
    const step = resolvedStep({ data: { randomValue: { name: "road" }, customValue: { list: ["保底"] } } });
    const ctx = { rng: seqRng([0]), candidates: { ...pool, road: [] } };
    expect(generateStepValue(step, ctx)).toBe("保底");
  });

  it("customValue(自定义列表):抽一个", () => {
    const step = resolvedStep({ data: { customValue: { list: ["自定义一", "自定义二", "自定义三"] } } });
    const ctx = { rng: seqRng([0.4]), candidates: pool };
    expect(generateStepValue(step, ctx)).toBe("自定义二");
  });

  it("customValue 列表为空 → 该段跳过", () => {
    const step = resolvedStep({ data: { customValue: { list: [] } } });
    const ctx = { rng: seqRng([0.4]), candidates: pool };
    expect(generateStepValue(step, ctx)).toBeNull();
  });

  it("randomNumber(随机数字):arabic 输出数字串", () => {
    const step = resolvedStep({ data: { randomNumber: { format: "arabic", minDigits: 1, maxDigits: 4 } } });
    // randInt(1,4):0.99 → 4;首位 1;补位 0,0,0.2,0.5 → 1025
    const ctx = { rng: seqRng([0.99, 0, 0, 0.2, 0.5]), candidates: pool };
    expect(generateStepValue(step, ctx)).toBe("1025");
  });

  it("randomNumber:chinese 输出中文数字", () => {
    const step = resolvedStep({ data: { randomNumber: { format: "chinese", minDigits: 2, maxDigits: 2 } } });
    // randInt(2,2) → 2;首位 1(0 → 1);第二位 0.2 → 2 → 12 → "十二"
    const ctx = { rng: seqRng([0, 0, 0.2]), candidates: pool };
    expect(generateStepValue(step, ctx)).toBe("十二");
  });

  it("randomChinese(随机中文):输出规定长度中文(从词典片段累计)", () => {
    const step = resolvedStep({ data: { randomChinese: { minLength: 2, maxLength: 2 } } });
    const ctx = { rng: seqRng([0, 0, 0]), candidates: pool };
    const out = generateStepValue(step, ctx);
    expect(typeof out).toBe("string");
    expect(out!.length).toBeGreaterThanOrEqual(2);
  });

  it("randomChinese:DB 名称存在时首字命中真实片段", () => {
    const step = resolvedStep({ data: { randomChinese: { minLength: 1, maxLength: 1 } } });
    const ctx = {
      rng: seqRng([0]),
      candidates: pool,
      realNames: ["阳光花园", "金色家园"],
    };
    expect(generateStepValue(step, ctx)).toBe("阳");
  });

  it("ABCD 全部为空 → 整步跳过(null)", () => {
    const step = resolvedStep({ data: {}, skipRate: 0 });
    const ctx = { rng: seqRng([0]), candidates: pool };
    expect(generateStepValue(step, ctx)).toBeNull();
  });

  it("randomValue/customValue/randomNumber 任取其一:随机起点选源,取该源一个值(不拼接)", () => {
    const step = resolvedStep({
      data: {
        randomValue: { name: "road" },
        customValue: { list: ["X"] },
        randomNumber: { format: "arabic", minDigits: 1, maxDigits: 1 },
      },
    });
    // makers=[randomValue,customValue,randomNumber];start=floor(0*3)=0 → 从 randomValue 开始 → 0.4 → 中山路
    const ctx = { rng: seqRng([0, 0.4]), candidates: pool };
    expect(generateStepValue(step, ctx)).toBe("中山路");
  });

  it("randomValue/customValue/randomNumber 任取其一:起点落在 customValue → 取 customValue 值", () => {
    const step = resolvedStep({
      data: {
        randomValue: { name: "road" },
        customValue: { list: ["X"] },
        randomNumber: { format: "arabic", minDigits: 1, maxDigits: 1 },
      },
    });
    // makers=[randomValue,customValue,randomNumber];start=floor(0.5*3)=1 → customValue → 取 X
    const ctx = { rng: seqRng([0.5, 0]), candidates: pool };
    expect(generateStepValue(step, ctx)).toBe("X");
  });

  it("randomValue/customValue/randomNumber 任取其一:起点源取不到(池空)→ 环形尝试下一个激活源", () => {
    const step = resolvedStep({
      data: {
        randomValue: { name: "road" },
        customValue: { list: ["X"] },
        randomNumber: { format: "arabic", minDigits: 1, maxDigits: 1 },
      },
    });
    // start=floor(0*3)=0 → randomValue(road 池空)→ customValue → X
    const ctx = {
      rng: seqRng([0, 0]),
      candidates: { ...pool, road: [] },
    };
    expect(generateStepValue(step, ctx)).toBe("X");
  });

  it("randomNumber weights:按权重采样位数", () => {
    const step = resolvedStep({
      data: {
        randomNumber: {
          format: "arabic",
          minDigits: 1,
          maxDigits: 4,
          weights: { "2": 5, "3": 2, "4": 1 },
        },
      },
    });
    // 桶 [2,2,2,2,2,3,3,4];rng=0 → 2;首位 1;补位 0 → "10"
    expect(
      generateStepValue(step, { rng: seqRng([0, 0]), candidates: pool }),
    ).toBe("10");
  });

  it("randomNumber weights:无 weights 时退化为 randInt(min, max)", () => {
    const step = resolvedStep({
      data: { randomNumber: { format: "arabic", minDigits: 1, maxDigits: 4 } },
    });
    const ctx = { rng: seqRng([0.99, 0, 0, 0.2, 0.5]), candidates: pool };
    expect(generateStepValue(step, ctx)).toBe("1025");
  });

  it("skipRate 100 时整步跳过", () => {
    const step = resolvedStep({ skipRate: 100 });
    const ctx = { rng: seqRng([0]), candidates: pool };
    expect(generateStepValue(step, ctx)).toBeNull();
  });

  it("skipRate 0 时永不跳过", () => {
    const step = resolvedStep();
    const ctx = { rng: seqRng([0]), candidates: pool };
    expect(generateStepValue(step, ctx)).not.toBeNull();
  });

  it("noiseRate 0 → 无干扰,原样返回", () => {
    const step = resolvedStep({ noiseRate: 0 });
    const ctx = { rng: seqRng([0.4]), candidates: pool };
    expect(generateStepValue(step, ctx)).toBe("中山路");
  });

  it("noiseRate 100 → 命中后注入干扰(丢字)", () => {
    // rng:0.4→取"中山路";noise:0(命中)、idx=0、kind=0(丢字)
    const step = resolvedStep({ noiseRate: 100 });
    const ctx = { rng: seqRng([0.4, 0, 0, 0]), candidates: pool };
    expect(generateStepValue(step, ctx)).toBe("山路");
  });

  it("prefix 拼接 + 独立跳过率", () => {
    const step = resolvedStep({
      prefix: { texts: ["大"], skipRate: 0 },
    });
    const ctx = { rng: seqRng([0.4, 0]), candidates: pool };
    expect(generateStepValue(step, ctx)).toBe("大中山路");
  });

  it("prefix 按 skipRate 跳过", () => {
    const step = resolvedStep({
      prefix: { texts: ["大"], skipRate: 100 },
    });
    const ctx = { rng: seqRng([0.4, 0]), candidates: pool };
    expect(generateStepValue(step, ctx)).toBe("中山路");
  });

  it("suffix 拼接 + 独立跳过率", () => {
    const step = resolvedStep({
      suffix: { texts: ["弄"], skipRate: 0 },
    });
    const ctx = { rng: seqRng([0.4, 0]), candidates: pool };
    expect(generateStepValue(step, ctx)).toBe("中山路弄");
  });

  it("prefix 多值:随机抽一个拼接", () => {
    const step = resolvedStep({
      prefix: { texts: ["大", "老"], skipRate: 0 },
    });
    const ctx = { rng: seqRng([0.4, 0.99]), candidates: pool };
    expect(generateStepValue(step, ctx)).toBe("老中山路");
  });
});

describe("generateAddress 整条规则拼接 + 标注", () => {
  const steps: ResolvedAddrSimStep[] = [
    { name: "城市", data: { randomValue: { name: "road" } }, skipRate: 0, noiseRate: 0 },
    { name: "路", data: { randomValue: { name: "road" } }, skipRate: 0, noiseRate: 0 },
  ];

  it("按步骤顺序拼接地址 + 标注偏移", () => {
    const ctx = { rng: seqRng([0.4, 0.4]), candidates: pool };
    const { address, result } = generateAddress(steps, ctx);
    expect(address).toBe("中山路中山路");
    expect(result[0]?.value.labels).toEqual(["城市"]);
    expect(result[1]?.value.labels).toEqual(["路"]);
  });

  it("skipRate 命中的步骤在 result 中不出现,但不打断偏移", () => {
    const ctx = { rng: seqRng([0.4, 0.4, 0]), candidates: pool };
    const { address, result } = generateAddress(
      [{ name: "城市", data: { randomValue: { name: "road" } }, skipRate: 100, noiseRate: 0 }, steps[1]!],
      ctx,
    );
    expect(address).toBe("中山路");
    expect(result).toHaveLength(1);
    expect(result[0]?.value.labels).toEqual(["路"]);
  });

  it("前后缀 + 整步 prefix/suffix 拼接", () => {
    const stepList: ResolvedAddrSimStep[] = [
      {
        name: "城市",
        data: { randomValue: { name: "road" } },
        prefix: { texts: ["老"], skipRate: 0 },
        skipRate: 0,
        noiseRate: 0,
      },
    ];
    const ctx = { rng: seqRng([0.4, 0]), candidates: pool };
    const { address } = generateAddress(stepList, ctx);
    expect(address).toBe("老中山路");
  });
});

describe("generateDataset 批量", () => {
  it("count 条记录,每条自增 id(此处仅校验条数与内容结构)", () => {
    const steps: ResolvedAddrSimStep[] = [
      { name: "城市", data: { randomValue: { name: "road" } }, skipRate: 0, noiseRate: 0 },
    ];
    const items = generateDataset(steps, 3, {
      rng: seqRng([0, 0.4, 0.99]),
      candidates: pool,
    });
    expect(items).toHaveLength(3);
    expect(items[0]?.data.address).toBeTruthy();
    expect(items[0]?.annotations[0]?.result[0]?.value.labels).toEqual(["城市"]);
  });
});

describe("generateForRules 多规则按比例合成", () => {
  it("counts 与规则一一对应", () => {
    const items = generateForRules(
      [
        { name: "r1", steps: [{ name: "路", data: { randomValue: { name: "road" } }, skipRate: 0, noiseRate: 0 }] },
        { name: "r2", steps: [{ name: "村", data: { randomValue: { name: "village" } }, skipRate: 0, noiseRate: 0 }] },
      ],
      [1, 2],
      { rng: seqRng([0, 0.4, 0.99]), candidates: pool },
    );
    expect(items).toHaveLength(3);
    expect(items[0]?.meta?.rule).toBe("r1");
  });

  it("counts[i]=0 时跳过该规则", () => {
    const items = generateForRules(
      [
        { name: "r1", steps: [{ name: "路", data: { randomValue: { name: "road" } }, skipRate: 0, noiseRate: 0 }] },
        { name: "r2", steps: [{ name: "村", data: { randomValue: { name: "village" } }, skipRate: 0, noiseRate: 0 }] },
      ],
      [0, 1],
      { rng: seqRng([0]), candidates: pool },
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.meta?.rule).toBe("r2");
  });
});

describe("computeCountsByRatios 条数换算", () => {
  it("向下取整 + 余数并入第一条", () => {
    expect(
      computeCountsByRatios(
        [
          { id: "a", ratio: 33 },
          { id: "b", ratio: 33 },
          { id: "c", ratio: 34 },
        ],
        10,
      ),
    ).toEqual([4, 3, 3]);
  });

  it("空数组返回空", () => {
    expect(computeCountsByRatios([], 100)).toEqual([]);
  });
});

describe("shuffleArray 乱序", () => {
  it("内容集合不变", () => {
    const arr = [1, 2, 3, 4, 5];
    const shuffled = shuffleArray([...arr], seqRng([0.99, 0, 0.5, 0.2, 0.7]));
    expect(shuffled.sort()).toEqual(arr);
  });
});

describe("previewStepValues 10 条样本", () => {
  it("返回 10 个样本(含 null)", () => {
    const step = resolvedStep({ skipRate: 50 });
    const samples = previewStepValues(step, 10, {
      rng: Math.random,
      candidates: pool,
    });
    expect(samples).toHaveLength(10);
    expect(samples.every((s) => typeof s === "string" || s === null)).toBe(true);
  });
});

describe("toLabelStudioExported 完整 LS 格式", () => {
  it("顶层字段齐全", () => {
    const items: Array<{
      data: { address: string };
      annotations: Array<{ result: Array<{ value: { start: number; end: number; labels: string[]; text: string } }> }>;
    }> = [
      {
        data: { address: "上海" },
        annotations: [
          {
            result: [
              { value: { start: 0, end: 2, labels: ["城市"], text: "上海" } },
            ],
          },
        ],
      },
    ];
    const exported = toLabelStudioExported(
      items as never,
      { fromName: "label", toName: "address", now: new Date("2025-01-01T00:00:00Z") },
    );
    expect(exported).toHaveLength(1);
    const first = exported[0]!;
    expect(first.id).toBe(1);
    expect(first.from_name ?? (first.annotations as Array<{ result: Array<{ from_name: string; to_name: string }> }>)[0]?.result[0]?.from_name).toBe("label");
    expect(first.data).toEqual({ address: "上海" });
  });
});
