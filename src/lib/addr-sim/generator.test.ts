import { describe, expect, it } from "vitest";

import type { AddrSimStep } from "@/lib/validators/addr-sim";

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

/** 构造一个 randomValue 步骤 */
function valueStep(
  overrides: Partial<AddrSimStep> = {},
): AddrSimStep {
  return {
    name: "路",
    randomValue: { name: "road" },
    skipRate: 0,
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

describe("generateStepValue 单步取值", () => {
  it("randomValue:从表候选值取一个", () => {
    const step = valueStep();
    const ctx = { rng: seqRng([0.4]), candidates: pool };
    expect(generateStepValue(step, ctx)).toBe("中山路");
  });

  it("customValue:从自定义列表取一个", () => {
    const step: AddrSimStep = {
      name: "路",
      customValue: { list: ["自定义一", "自定义二", "自定义三"] },
      skipRate: 0,
    };
    const ctx = { rng: seqRng([0.4]), candidates: pool };
    expect(generateStepValue(step, ctx)).toBe("自定义二");
  });

  it("customValue:空列表返回 null", () => {
    const step: AddrSimStep = {
      name: "路",
      customValue: { list: [] },
      skipRate: 0,
    };
    const ctx = { rng: seqRng([0.4]), candidates: pool };
    expect(generateStepValue(step, ctx)).toBeNull();
  });

  it("randomValue:候选池为空返回 null", () => {
    const step = valueStep({ randomValue: { name: "road" } });
    const ctx = {
      rng: seqRng([0]),
      candidates: { ...pool, road: [] },
    };
    expect(generateStepValue(step, ctx)).toBeNull();
  });

  it("randomNumber:arabic 输出数字串", () => {
    const step: AddrSimStep = {
      name: "路号",
      randomNumber: { format: "arabic", minDigits: 1, maxDigits: 4 },
      skipRate: 0,
    };
    // 位数 randInt(1,4):0.99 → 4;首位 randInt(1,9):0 → 1;
    // 之后 3 位:0,0.2,0.5 → 数字 1025
    const ctx = { rng: seqRng([0.99, 0, 0, 0.2, 0.5]), candidates: pool };
    expect(generateStepValue(step, ctx)).toBe("1025");
  });

  it("randomNumber:chinese 输出中文数字", () => {
    const step: AddrSimStep = {
      name: "路号",
      randomNumber: { format: "chinese", minDigits: 2, maxDigits: 2 },
      skipRate: 0,
    };
    // 位数 randInt(2,2) 消耗 0;首位 1(9 选 1 的 0);第二位 0.2 → 2 → 12 → "十二"
    const ctx = { rng: seqRng([0, 0, 0.2]), candidates: pool };
    expect(generateStepValue(step, ctx)).toBe("十二");
  });

  it("randomChinese:输出规定长度中文", () => {
    const step: AddrSimStep = {
      name: "其他",
      randomChinese: { minLength: 2, maxLength: 2 },
      skipRate: 0,
    };
    // randInt(2,2) → 2;两个汉字:0.01 → HAN_CHARS[0]='长',0.02 → '街'
    const ctx = { rng: seqRng([0, 0.01, 0.02]), candidates: pool };
    expect(generateStepValue(step, ctx)).toBe("长街");
  });

  it("skipRate 100 时整步跳过", () => {
    const step = valueStep({ skipRate: 100 });
    const ctx = { rng: seqRng([0]), candidates: pool };
    expect(generateStepValue(step, ctx)).toBeNull();
  });

  it("skipRate 0 时永不跳过", () => {
    const step = valueStep();
    const ctx = { rng: seqRng([0]), candidates: pool };
    expect(generateStepValue(step, ctx)).not.toBeNull();
  });

  it("prefix 拼接 + 独立跳过率", () => {
    const step = valueStep({
      prefix: { texts: ["大"], skipRate: 0 },
    });
    const ctx = { rng: seqRng([0.4, 0]), candidates: pool }; // 先取值,再判定 prefix 不跳过
    expect(generateStepValue(step, ctx)).toBe("大中山路");
  });

  it("prefix 按 skipRate 跳过", () => {
    const step = valueStep({
      prefix: { texts: ["大"], skipRate: 100 },
    });
    const ctx = { rng: seqRng([0.4, 0]), candidates: pool };
    expect(generateStepValue(step, ctx)).toBe("中山路");
  });

  it("suffix 拼接 + 独立跳过率", () => {
    const step = valueStep({
      suffix: { texts: ["弄"], skipRate: 0 },
    });
    const ctx = { rng: seqRng([0.4, 0]), candidates: pool };
    expect(generateStepValue(step, ctx)).toBe("中山路弄");
  });

  it("prefix 多值:随机抽一个拼接", () => {
    const step = valueStep({
      prefix: { texts: ["大", "老"], skipRate: 0 },
    });
    // 0.4 → 中山路;0.99 → pickOne(["大","老"]) 索引 1 → "老"
    const ctx = { rng: seqRng([0.4, 0.99]), candidates: pool };
    expect(generateStepValue(step, ctx)).toBe("老中山路");
  });

  it("prefix 多值:空数组不拼接(即使 skipRate=0)", () => {
    const step = valueStep({
      prefix: { texts: [], skipRate: 0 },
    });
    const ctx = { rng: seqRng([0.4]), candidates: pool };
    expect(generateStepValue(step, ctx)).toBe("中山路");
  });
});

describe("generateAddress 整条规则拼接 + 标注", () => {
  const steps: AddrSimStep[] = [
    { name: "城市", randomValue: { name: "road" }, skipRate: 0 },
    { name: "路", randomValue: { name: "road" }, skipRate: 0 },
    {
      name: "路号",
      randomNumber: { format: "arabic", minDigits: 1, maxDigits: 1 },
      skipRate: 0,
    },
  ];

  it("空串拼接生成地址", () => {
    // 城市取 index0 = "新市路";路取 index0.4 → "中山路";
    // 路号:位数 randInt(1,1) 消耗 0 → 1 位;首位 0 → 1 → "1"
    const ctx = { rng: seqRng([0, 0.4, 0, 0]), candidates: pool };
    const { address } = generateAddress(steps, ctx);
    expect(address).toBe("新市路中山路1");
  });

  it("标注分片偏移与地址一致", () => {
    const ctx = { rng: seqRng([0, 0.4, 0, 0]), candidates: pool };
    const { address, result } = generateAddress(steps, ctx);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      from_name: "label",
      to_name: "address",
      type: "labels",
      value: {
        start: 0,
        end: 3,
        labels: ["城市"],
        text: "新市路",
      },
    });
    expect(result[1]!.value.start).toBe(3);
    expect(result[1]!.value.end).toBe(6);
    expect(result[2]!.value.start).toBe(6);
    expect(result[2]!.value.end).toBe(7);
    // 分片拼接起来必须等于完整地址
    const joined = result.map((r) => r.value.text).join("");
    expect(joined).toBe(address);
  });

  it("步骤 skipRate 跳过时不产生标注", () => {
    const s: AddrSimStep[] = [
      { name: "城市", randomValue: { name: "road" }, skipRate: 100 },
    ];
    const ctx = { rng: seqRng([0]), candidates: pool };
    const { address, result } = generateAddress(s, ctx);
    expect(address).toBe("");
    expect(result).toHaveLength(0);
  });
});

describe("generateDataset 批量生成", () => {
  it("生成指定条数且每条都带 data + annotations", () => {
    const steps: AddrSimStep[] = [
      { name: "路", randomValue: { name: "road" }, skipRate: 0 },
    ];
    const ctx = { rng: seqRng([0, 0.4, 0.7]), candidates: pool };
    const items = generateDataset(steps, 3, ctx);
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item.data.address).toBeTruthy();
      expect(item.annotations[0]!.result[0]!.value.labels).toEqual(["路"]);
    }
    expect(items[0]!.data.address).toBe("新市路");
    expect(items[1]!.data.address).toBe("中山路");
    expect(items[2]!.data.address).toBe("人民路");
  });
});

describe("generateForRules 按规则 + 数量合成", () => {
  it("按 counts 分配合成并带规则名 meta", () => {
    const rules = [
      {
        name: "规则A",
        steps: [{ name: "路", randomValue: { name: "road" }, skipRate: 0 }] as AddrSimStep[],
      },
      {
        name: "规则B",
        steps: [{ name: "路", randomValue: { name: "road" }, skipRate: 0 }] as AddrSimStep[],
      },
    ];
    const ctx = { rng: seqRng([0, 0.4, 0.7, 0.9]), candidates: pool };
    const items = generateForRules(rules, [2, 2], ctx);
    expect(items).toHaveLength(4);
    expect(items.slice(0, 2).every((it) => it.meta?.rule === "规则A")).toBe(true);
    expect(items.slice(2).every((it) => it.meta?.rule === "规则B")).toBe(true);
  });
});

describe("previewStepValues 单步预览", () => {
  it("返回 N 个样本,被跳过时为 null", () => {
    const step = valueStep({ skipRate: 50 });
    // 先判 skipRate:sample0 hits(50) 0.4 → 40<50 → 跳过;sample1 0.99 → 不跳,取值 0.7 → 人民路;
    // sample2 hits 0.6 → 不跳,取值 0.4 → 中山路
    const ctx = { rng: seqRng([0.4, 0.99, 0.7, 0.6, 0.4]), candidates: pool };
    const samples = previewStepValues(step, 3, ctx);
    expect(samples).toHaveLength(3);
    expect(samples[0]).toBeNull();
    expect(samples[1]).toBe("人民路");
    expect(samples[2]).toBe("中山路");
  });
});
describe("toLabelStudioExported 完整 LS 导出格式", () => {
  const now = new Date("2026-05-10T06:53:07.347Z");
  const items = [
    {
      data: { address: "上海市新市路1500号" },
      annotations: [
        {
          result: [
            {
              from_name: "label",
              to_name: "address",
              type: "labels",
              value: { start: 0, end: 3, text: "上海市", labels: ["城市"] },
            },
            {
              from_name: "label",
              to_name: "address",
              type: "labels",
              value: { start: 3, end: 6, text: "新市路", labels: ["路"] },
            },
          ],
        },
      ],
    },
  ];

  it("顶层结构完整(data/annotations/file_upload/时间/计数)", () => {
    const out = toLabelStudioExported(items, {
      fromName: "standard",
      toName: "address",
      now,
    })[0]!;
    expect(out.id).toBe(1);
    expect(out.data).toEqual({ address: "上海市新市路1500号" });
    expect(out.file_upload).toBe("simulated_addresses.json");
    expect(out.created_at).toBe(now.toISOString());
    expect(out.inner_id).toBe(1);
    expect(out.total_annotations).toBe(1);
    expect(out.cancelled_annotations).toBe(0);
    expect(out.allow_skip).toBe(true);
    expect(Array.isArray(out.annotations)).toBe(true);
  });

  it("annotation 结构与 result 字段(from_name/to_name/origin/type/id/随机 id)", () => {
    const out = toLabelStudioExported(items, {
      fromName: "standard",
      toName: "address",
      now,
    })[0]!;
    const ann = (out.annotations as Array<Record<string, unknown>>)[0]!;
    expect(ann.completed_by).toBe(1);
    expect(ann.was_cancelled).toBe(false);
    expect(ann.ground_truth).toBe(false);
    expect(ann.task).toBe(1);
    const result = (ann.result as Array<Record<string, unknown>>)[0]!;
    expect(result.value).toEqual({ start: 0, end: 3, text: "上海市", labels: ["城市"] });
    expect(result.from_name).toBe("standard");
    expect(result.to_name).toBe("address");
    expect(result.type).toBe("labels");
    expect(result.origin).toBe("manual");
    expect(typeof result.id).toBe("string");
    expect((result.id as string).length).toBeGreaterThanOrEqual(6);
  });

  it("from_name / to_name 可自定义(用户二次编辑)", () => {
    const out = toLabelStudioExported(items, {
      fromName: "custom_label",
      toName: "custom_text",
      now,
    })[0]!;
    const ann = (out.annotations as Array<Record<string, unknown>>)[0]!;
    const result = (ann.result as Array<Record<string, unknown>>)[0]!;
    expect(result.from_name).toBe("custom_label");
    expect(result.to_name).toBe("custom_text");
  });

  it("多条递增 id", () => {
    const two = [
      ...items,
      {
        data: { address: "二" },
        annotations: [{ result: items[0]!.annotations[0]!.result }],
      },
    ];
    const out = toLabelStudioExported(two, { fromName: "a", toName: "b", now });
    expect(out).toHaveLength(2);
    expect(out[0]!.id).toBe(1);
    expect(out[1]!.id).toBe(2);
    expect(out[1]!.inner_id).toBe(2);
  });
});

describe("computeCountsByRatios 按比例分配条数(余数校正)", () => {
  it("66/34 总10 → [7,3] 合计10", () => {
    const cnt = computeCountsByRatios(
      [
        { id: "a", ratio: 66 },
        { id: "b", ratio: 34 },
      ],
      10,
    );
    expect(cnt).toEqual([7, 3]);
    expect(cnt.reduce((a, b) => a + b, 0)).toBe(10);
  });

  it("40/40/20 总10 → [4,4,2]", () => {
    const cnt = computeCountsByRatios(
      [
        { id: "a", ratio: 40 },
        { id: "b", ratio: 40 },
        { id: "c", ratio: 20 },
      ],
      10,
    );
    expect(cnt).toEqual([4, 4, 2]);
  });

  it("任意总量合计恒等于总量(预览 10 与导出 1000 一致性)", () => {
    const ratios = [
      { id: "a", ratio: 33 },
      { id: "b", ratio: 33 },
      { id: "c", ratio: 34 },
    ];
    for (const total of [10, 100, 1000, 10000]) {
      const cnt = computeCountsByRatios(ratios, total);
      expect(cnt.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
});

describe("shuffleArray 乱序", () => {
  it("固定 rng 下可预测打乱", () => {
    const rng = () => 0; // 永远交换到头部 => 数组反转
    expect(shuffleArray([1, 2, 3, 4], rng)).toEqual([2, 3, 4, 1]);
  });

  it("相同元素个数不变", () => {
    const arr = [1, 2, 3, 4, 5];
    const out = shuffleArray([...arr]);
    expect(out).toHaveLength(arr.length);
    expect([...out].sort()).toEqual(arr);
  });
});
