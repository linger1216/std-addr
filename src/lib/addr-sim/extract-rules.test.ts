import { describe, expect, it } from "vitest";

import {
  extractRules,
  summarizeExtraction,
  computeRadios,
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

describe("extractRules 从 Label Studio 文件提取规则(只存步骤骨架 [{name}])", () => {
  it("空数组 → []", () => {
    expect(extractRules([], opts)).toEqual([]);
  });

  it("非数组 / 非 {data:[...]} → []", () => {
    expect(extractRules(null, opts)).toEqual([]);
    expect(extractRules({ foo: 1 }, opts)).toEqual([]);
  });

  it("单条 record 单 result → 1 条规则,步骤只含英文 name", () => {
    const rules = extractRules([record([["城市", "路", "小区"]])], opts);
    expect(rules).toHaveLength(1);
    expect(rules[0]?.name).toBe("城市-路-小区");
    expect(rules[0]?.count).toBe(1);
    expect(rules[0]?.steps).toEqual([
      { name: "city" },
      { name: "road" },
      { name: "community" },
    ]);
    expect(rules[0]?.unknownLabels).toEqual([]);
  });

  it("英文 label(地址模拟导出)也能识别,不视为未知", () => {
    const rules = extractRules([record([["city", "road", "district"]])], opts);
    expect(rules).toHaveLength(1);
    expect(rules[0]?.name).toBe("城市-路-区县"); // 规则名用中文序列(label 表 label 列)
    expect(rules[0]?.steps).toEqual([
      { name: "city" },
      { name: "road" },
      { name: "district" },
    ]);
    expect(rules[0]?.unknownLabels).toEqual([]);
  });

  it("同一序列混用中文与英文 label → 合并为同一规则", () => {
    const json = [record([["城市", "road"]]), record([["city", "路"]])];
    const rules = extractRules(json, opts);
    expect(rules).toHaveLength(1);
    expect(rules[0]?.count).toBe(2);
    expect(rules[0]?.steps).toEqual([{ name: "city" }, { name: "road" }]);
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

  it("多条 record 不同序列 → 多条规则(规则名用中文序列)", () => {
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

  it("label.label 不在 label 表 → 该 label 被跳过(不影响其它 label)", () => {
    const rules = extractRules([record([["未知", "城市", "路", "未知2"]])], opts);
    expect(rules[0]?.name).toBe("城市-路");
    expect(rules[0]?.steps).toEqual([{ name: "city" }, { name: "road" }]);
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
    expect(rules[0]?.steps).toEqual([{ name: "city" }]);
    expect(rules[0]?.unknownLabels).toEqual([]);
  });

  it("支持顶层 { data: [...] } 形态", () => {
    const json = { data: [record([["城市", "路"]]), record([["路"]])] };
    const rules = extractRules(json, opts);
    expect(rules).toHaveLength(2);
  });

  it("步骤只存 name,不写入任何数据源/前后缀/跳过率(配置从要素拿)", () => {
    const rules = extractRules([record([["城市", "路"]])], opts);
    expect(rules[0]?.steps[0]).toEqual({ name: "city" });
    expect(rules[0]?.steps[1]).toEqual({ name: "road" });
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

  it("同序列(即使 text 不同)→ 合并为同一规则", () => {
    const json = [
      record([["城市", "路"]], "上海市新市路"),
      record([["城市", "路"]], "北京市长安路"),
    ];
    const rules = extractRules(json, opts);
    expect(rules).toHaveLength(1);
    expect(rules[0]?.count).toBe(2);
  });

  it("数组嵌套多值(一条 result 多个 labels)→ 按顺序收集", () => {
    const json = [record([["城市"], ["路"]])];
    const rules = extractRules(json, opts);
    expect(rules[0]?.steps.map((s) => s.name)).toEqual(["city", "road"]);
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

  it("不同规则各自的 unknownLabels 互不串扰(修复:全局并集 → 按 record 绑定)", () => {
    // 两条不同规则:规则1 有未知A,规则2 有未知B —— 各自 unknownLabels 不能互相包含
    const json = [
      record([["城市", "路", "未知A"]]),
      record([["村", "未知B", "路号"]]),
      record([["村", "路号"]]), // 规则2 的第三条样本(无未知)合并进规则2
    ];
    const rules = extractRules(json, opts);
    expect(rules).toHaveLength(2);
    const rule1 = rules.find((r) => r.name === "城市-路")!;
    const rule2 = rules.find((r) => r.name === "村-路号")!;
    expect(rule1.unknownLabels).toEqual(["未知A"]);
    expect(rule2.unknownLabels).toEqual(["未知B"]);
    // 规则2 的第三条样本无未知 → 合并后不引入额外未知
    expect(rule2.count).toBe(2);
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
