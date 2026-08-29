import { describe, expect, it } from "vitest";

import {
  extractRules,
  summarizeExtraction,
  computeRadio,
  computeRadios,
  extractArabicDigits,
  isChineseNumeric,
  type ExtractOptions,
} from "./extract-rules";

/** 标准 label 缓存(对齐 label 表 27 项中常出现的实体子集) */
const labels = [
  { name: "road_number", label: "路号" },
  { name: "city", label: "城市" },
  { name: "street", label: "街道" },
  { name: "road", label: "路" },
  { name: "community", label: "小区" },
  { name: "village", label: "村" },
  { name: "poi", label: "兴趣点" },
  { name: "district", label: "区县" },
  { name: "building", label: "楼栋" },
  { name: "floor", label: "楼层" },
  { name: "unit", label: "单元" },
  { name: "room", label: "室号" },
];

const opts: ExtractOptions = { labels };

/** 构造一条 LS record 的辅助 */
function record(
  labelsList: string[][],
  address = "上海市新市路100号",
): {
  data: { address: string };
  annotations: Array<{
    result: Array<{
      from_name: string;
      to_name: string;
      type: string;
      value: { start: number; end: number; labels: string[]; text: string };
    }>;
  }>;
} {
  let offset = 0;
  return {
    data: { address },
    annotations: [
      {
        result: labelsList.map((lbls) => {
          const text = "x".repeat(lbls.join("").length);
          const start = offset;
          offset += text.length;
          return {
            from_name: "label",
            to_name: "address",
            type: "labels",
            value: {
              start,
              end: offset,
              labels: lbls,
              text,
            },
          };
        }),
      },
    ],
  };
}

type LSRecordShape = {
  data: { address: string };
  annotations: Array<{
    result: Array<{
      from_name: string;
      to_name: string;
      type: string;
      value: { start: number; end: number; labels: string[]; text: string };
    }>;
  }>;
};

/** 构造带指定标注值(text)的 LS record:labels 与 texts 一一对应 */
function recordWithText(
  entries: Array<{ labels: string[]; text: string }>,
): LSRecordShape {
  let offset = 0;
  return {
    data: { address: "x" },
    annotations: [
      {
        result: entries.map((e) => {
          const start = offset;
          offset += e.text.length;
          return {
            from_name: "label",
            to_name: "address",
            type: "labels",
            value: {
              start,
              end: offset,
              labels: e.labels,
              text: e.text,
            },
          };
        }),
      },
    ],
  };
}

describe("extractRules 从 Label Studio 文件提取规则", () => {
  it("空数组 → []", () => {
    expect(extractRules([], opts)).toEqual([]);
  });

  it("非数组 / 非 {data:[...]} → []", () => {
    expect(extractRules(null, opts)).toEqual([]);
    expect(extractRules({ foo: 1 }, opts)).toEqual([]);
  });

  it("单条 record 单 result → 1 条规则", () => {
    const rules = extractRules([record([["城市", "路", "小区"]])], opts);
    expect(rules).toHaveLength(1);
    expect(rules[0]?.name).toBe("城市-路-小区");
    expect(rules[0]?.count).toBe(1);
    expect(rules[0]?.steps.map((s) => s.name)).toEqual(["城市", "路", "小区"]);
    expect(rules[0]?.unknownLabels).toEqual([]);
  });

  it("多条 record 相同序列 → 1 条规则 count=N", () => {
    const json = [
      record([["城市", "路"]]),
      record([["城市", "路"]]),
      record([["城市", "路"]]),
    ];
    const rules = extractRules(json, opts);
    expect(rules).toHaveLength(1);
    expect(rules[0]?.count).toBe(3);
  });

  it("多条 record 不同序列 → 多条规则", () => {
    const json = [
      record([["城市", "路"]]),
      record([["村", "路"]]),
      record([["城市", "小区"]]),
    ];
    const rules = extractRules(json, opts);
    expect(rules).toHaveLength(3);
    expect(rules.map((r) => r.name)).toEqual([
      "城市-路",
      "城市-小区",
      "村-路",
    ]);
  });

  it("label.name 命中实体表 → randomValue.name 用对应实体表", () => {
    const rules = extractRules([record([["路", "小区", "村", "兴趣点"]])], opts);
    expect(rules[0]?.steps.map((s) => s.randomValue?.name)).toEqual([
      "road",
      "community",
      "village",
      "poi",
    ]);
  });

  it("label.name 不命中实体表且值非数字 → 自定义列表收集值", () => {
    const rules = extractRules(
      [recordWithText([
        { labels: ["城市"], text: "上海市" },
        { labels: ["楼层"], text: "顶楼" },
        { labels: ["室号"], text: "未知门牌" },
      ])],
      opts,
    );
    expect(rules[0]?.steps.map((s) => s.customValue?.list)).toEqual([
      ["上海市"],
      ["顶楼"],
      ["未知门牌"],
    ]);
  });

  it("label.label 不在 label 表 → 该 label 被跳过(不影响其它 label)", () => {
    const rules = extractRules([record([["未知", "城市", "路", "未知2"]])], opts);
    expect(rules[0]?.name).toBe("城市-路");
    expect(rules[0]?.steps).toHaveLength(2);
    // 未知 label 应被收集到此规则的 unknownLabels
    expect(rules[0]?.unknownLabels).toEqual(["未知", "未知2"]);
  });

  it("全部 label 未知 → 该 record 跳过", () => {
    const rules = extractRules([record([["未知1", "未知2"]])], opts);
    expect(rules).toEqual([]);
  });

  it("缺 annotations / result / value.labels → 优雅跳过", () => {
    const rules = extractRules(
      [
        { data: { address: "x" } }, // 无 annotations
        { annotations: [] }, // 空 annotations
        { annotations: [{}] }, // 空 result
        { annotations: [{ result: [{}] }] }, // value 缺失
        { annotations: [{ result: [{ value: { labels: "city" } }] }] }, // labels 非数组
        record([["城市"]]),
      ],
      opts,
    );
    expect(rules).toHaveLength(1);
    expect(rules[0]?.name).toBe("城市");
    expect(rules[0]?.unknownLabels).toEqual([]);
  });

  it("支持顶层 { data: [...] } 形态", () => {
    const json = { data: [record([["城市", "路"]]), record([["路"]])] };
    const rules = extractRules(json, opts);
    expect(rules).toHaveLength(2);
  });

  it("步骤结构只保留 name + 来源 + skipRate(无 prefix/suffix)", () => {
    const rules = extractRules([record([["城市", "路"]])], opts);
    // record() 默认 text 为 "xxx"(非数字)→ 城市走自定义,路命中实体表
    expect(rules[0]?.steps[0]).toEqual({
      name: "城市",
      customValue: { list: ["xxx"] },
      skipRate: 0,
    });
    expect(rules[0]?.steps[1]).toEqual({
      name: "路",
      randomValue: { name: "road" },
      skipRate: 0,
    });
    expect(rules[0]?.unknownLabels).toEqual([]);
  });

  it("按出现次数降序排序", () => {
    const json = [
      record([["城市", "路"]]),
      record([["城市", "路"]]),
      record([["城市", "路"]]),
      record([["村", "路"]]),
    ];
    const rules = extractRules(json, opts);
    expect(rules[0]?.count).toBe(3);
    expect(rules[1]?.count).toBe(1);
  });

  it("同名/同序列在 steps 完全一致时才合并(忽略后续 record 的 text)", () => {
    // 两条 record text 不同但 labels 序列相同 → 同一规则
    const json = [
      record([["城市", "路"]], "上海市新市路"),
      record([["城市", "路"]], "北京市长安路"),
    ];
    const rules = extractRules(json, opts);
    expect(rules).toHaveLength(1);
    expect(rules[0]?.count).toBe(2);
  });
});

describe("summarizeExtraction 解析摘要", () => {
  it("返回总记录数 / 规则数 / 未知 label 列表", () => {
    const json = [
      record([["城市", "路"]]),
      record([["未知A", "城市", "路", "未知B"]]),
      record([["未知A"]]),
    ];
    const rules = extractRules(json, opts);
    const summary = summarizeExtraction(json, opts, rules);
    expect(summary.totalRecords).toBe(3);
    expect(summary.ruleCount).toBe(1); // 两条 ["城市","路"] 合并为 1 条规则;["未知A"] 全未知被跳过
    expect(summary.unknownLabels.sort()).toEqual(["未知A", "未知B"]);
  });
});

describe("unknownLabels 字段", () => {
  it("record 全部已知 → unknownLabels 为空数组", () => {
    const rules = extractRules([record([["城市", "路"]])], opts);
    expect(rules[0]?.unknownLabels).toEqual([]);
  });

  it("record 部分未知 → 未知 label 收集到此规则的 unknownLabels", () => {
    const rules = extractRules(
      [record([["未知A", "城市", "未知B", "路"]])],
      opts,
    );
    expect(rules[0]?.name).toBe("城市-路");
    // insertion 顺序:先遇到的未知 label 在前
    expect(rules[0]?.unknownLabels).toEqual(["未知A", "未知B"]);
  });

  it("同一 record 出现多次同一未知 label → 去重", () => {
    const rules = extractRules(
      [record([["未知A", "城市", "未知A", "路", "未知B", "未知A"]])],
      opts,
    );
    expect(rules[0]?.unknownLabels).toEqual(["未知A", "未知B"]);
  });

  it("多条 record 合并同规则 → unknownLabels 并集", () => {
    const json = [
      record([["城市", "路", "未知A"]]),
      record([["城市", "路", "未知B"]]),
      record([["城市", "路", "未知A", "未知C"]]),
    ];
    const rules = extractRules(json, opts);
    expect(rules).toHaveLength(1);
    expect(rules[0]?.count).toBe(3);
    // insertion 顺序:首次出现的未知 label 在前
    expect(rules[0]?.unknownLabels).toEqual(["未知A", "未知B", "未知C"]);
  });

  it("summarizeExtraction.unknownLabels 是所有 rules 的未知 label 并集", () => {
    const json = [
      record([["城市", "路", "未知A"]]),
      record([["村", "路号", "未知B"]]),
      record([["城市", "未知C", "路"]]),
    ];
    const rules = extractRules(json, opts);
    const summary = summarizeExtraction(json, opts, rules);
    expect(summary.unknownLabels.sort()).toEqual(["未知A", "未知B", "未知C"]);
  });
});
describe("精细化数据来源推导", () => {
  it("实体表优先:值即使全数字也走实体表", () => {
    const rules = extractRules(
      [recordWithText([
        { labels: ["路"], text: "1500" },
        { labels: ["村"], text: "120号" },
      ])],
      opts,
    );
    expect(rules[0]?.steps[0]!.randomValue?.name).toBe("road");
    expect(rules[0]?.steps[1]!.randomValue?.name).toBe("village");
  });

  it("全部阿拉伯数字值 → randomNumber arabic(位数取最短/最长)", () => {
    const json = [
      recordWithText([{ labels: ["路号"], text: "5号" }]),
      recordWithText([{ labels: ["路号"], text: "1500号" }]),
    ];
    const rules = extractRules(json, opts);
    expect(rules[0]?.steps[0]!.randomNumber).toEqual({
      format: "arabic",
      minDigits: 1,
      maxDigits: 4,
    });
  });

  it("全部中文数字值 → randomNumber chinese", () => {
    const rules = extractRules(
      [recordWithText([{ labels: ["路号"], text: "一百五十号" }])],
      opts,
    );
    expect(rules[0]?.steps[0]!.randomNumber?.format).toBe("chinese");
  });

  it("阿拉伯与中文数字混合 → 自定义列表(保留原始值)", () => {
    const json = [
      recordWithText([{ labels: ["路号"], text: "1500号" }]),
      recordWithText([{ labels: ["路号"], text: "十五号" }]),
    ];
    const rules = extractRules(json, opts);
    expect(rules[0]?.steps[0]!.customValue?.list).toEqual(["1500号", "十五号"]);
  });

  it("数组嵌套多值(一条 result 多个 labels)→ 按顺序收集", () => {
    const json = [record([["城市"], ["路"]])];
    const rules = extractRules(json, opts);
    expect(rules[0]?.steps.map((s) => s.name)).toEqual(["城市", "路"]);
  });

  it("去重后值很大(>40)→ 仍写入 customValue.list(不再兜底)", () => {
    // 上限已去除:即使 100 个不同值也全部写入自定义列表
    const json = Array.from({ length: 100 }, (_, i) =>
      recordWithText([{ labels: ["城市"], text: `自定义值${i}` }]),
    );
    const rules = extractRules(json, opts);
    expect(rules[0]?.steps[0]!.customValue?.list).toHaveLength(100);
    expect(rules[0]?.steps[0]!.randomValue).toBeUndefined();
  });

  it("自定义列表去重:相同值只保留一份", () => {
    const json = [
      recordWithText([{ labels: ["城市"], text: "甲" }]),
      recordWithText([{ labels: ["城市"], text: "甲" }]),
      recordWithText([{ labels: ["城市"], text: "乙" }]),
    ];
    const rules = extractRules(json, opts);
    expect(rules[0]?.steps[0]!.customValue?.list).toEqual(["甲", "乙"]);
    expect(rules[0]?.count).toBe(3);
  });
});

describe("数字识别工具", () => {
  it("extractArabicDigits:纯数字与带单位后缀", () => {
    expect(extractArabicDigits("1500")).toBe("1500");
    expect(extractArabicDigits("1500号")).toBe("1500");
    expect(extractArabicDigits("15号楼")).toBe("15");
    expect(extractArabicDigits("一楼")).toBeNull();
    expect(extractArabicDigits("abc")).toBeNull();
  });

  it("isChineseNumeric:中文数字判断", () => {
    expect(isChineseNumeric("一百五十")).toBe(true);
    expect(isChineseNumeric("十五号")).toBe(true);
    expect(isChineseNumeric("二楼")).toBe(true);
    expect(isChineseNumeric("1500")).toBe(false);
    expect(isChineseNumeric("abc")).toBe(false);
  });
});

describe("computeRadios 批量占比(最大余数法,合计恒 100)", () => {
  it("均匀 3 规则 → 33/33/34", () => {
    expect(computeRadios([1, 1, 1])).toEqual([34, 33, 33]);
  });

  it("2:1 → 67/33", () => {
    expect(computeRadios([2, 1])).toEqual([67, 33]);
  });

  it("2:2:1 → 40/40/20", () => {
    expect(computeRadios([2, 2, 1])).toEqual([40, 40, 20]);
  });

  it("单规则 → [100]", () => {
    expect(computeRadios([7])).toEqual([100]);
  });

  it("空/全零 → []", () => {
    expect(computeRadios([])).toEqual([]);
    expect(computeRadios([0, 0])).toEqual([]);
  });

  it("合计恒等于 100(任意分布)", () => {
    for (const counts of [
      [3, 2, 1, 1],
      [5, 4, 3, 2, 1],
      [10, 1, 1, 1, 1, 1],
      [99, 1],
    ]) {
      const radios = computeRadios(counts);
      expect(radios.reduce((a, b) => a + b, 0)).toBe(100);
    }
  });
});

describe("computeRadio 规则占比计算", () => {
  it("整数占比", () => {
    expect(computeRadio(10, 100)).toBe(10);
    expect(computeRadio(30, 100)).toBe(30);
    expect(computeRadio(50, 200)).toBe(25);
  });

  it("非整除 → 四舍五入", () => {
    expect(computeRadio(1, 3)).toBe(33); // 33.33 → 33
    expect(computeRadio(2, 3)).toBe(67); // 66.67 → 67
  });

  it("边界 clamp 1~100", () => {
    expect(computeRadio(100, 100)).toBe(100);
    expect(computeRadio(1, 1000)).toBe(1); // 0.1 → clamp 1
    expect(computeRadio(0, 100)).toBe(1); // 0 次 → clamp 1
  });

  it("total 非法(0 / NaN)→ 100", () => {
    expect(computeRadio(5, 0)).toBe(100);
    expect(computeRadio(5, Number.NaN)).toBe(100);
  });
});
