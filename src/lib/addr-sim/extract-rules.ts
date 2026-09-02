/**
 * 从 Label Studio 标注文件提取地址模拟规则(纯客户端,纯函数,可测)。
 *
 * 导入的规则只存步骤骨架 `[{ name: 要素 }]` —— 所有数据源/前后缀/跳过率/干扰率
 * 均从地址要素默认配置读取,生成时自动取要素配置。
 * 用户可在规则编辑器里用「自定义配置」把要素配置复制到步骤并修改。
 *
 * 输入:LS 标注 JSON(数组或 {data: [...]}),每条 record 含 annotations[0].result[].value.labels
 *      其中 labels 数组元素是中文 label.label(对应 label 表的 label 列)。
 * 输出:ExtractedRule[] —— 按步骤序列去重,带出现次数 + 推荐规则名(中文序列)。
 */

import type { AddrSimStep } from "@/lib/validators/addr-sim";

/** 提取出的候选规则(供前端预览 + 勾选导入) */
export interface ExtractedRule {
  /** 推荐规则名:要素中文序列拼接(如 城市-路),顺序敏感 */
  name: string;
  /** 步骤骨架:只含 name(英文要素名),配置从要素默认读取 */
  steps: AddrSimStep[];
  /** 该序列在文件中出现的次数(不入库,仅 UI 展示) */
  count: number;
  /**
   * 解析时被丢弃的 label(原始 record 含但 label 表里没有)。
   * UI 用 ⚠️ 徽章 + tooltip 提示用户补 label 字典后重导。
   * 空数组 = 此规则不涉及未知 label。
   */
  unknownLabels: string[];
}

/** 输入选项 */
export interface ExtractOptions {
  /** label 表缓存 [{ name, label }];用于 label.label(中文) → label.name(英文) */
  labels: Array<{ name: string; label: string }>;
}

/** LS 单条 record 的最小形态(只取解析所需字段,避免强类型耦合 LS 全量结构) */
interface LSRecordLike {
  data?: { address?: unknown };
  annotations?: Array<{
    result?: Array<{
      value?: { labels?: unknown; text?: unknown };
    }>;
  }>;
}

/**
 * 把标注里的 label 映射到要素英文 name(支持中文与英文两种标注):
 *  - 中文 label.label(如「城市」)→ name(如 city),Label Studio 中文标注;
 *  - 英文 name(如 city)→ 自身,地址模拟导出为英文。
 * 查不到返回 null。
 */
function buildLabelLookup(
  labels: Array<{ name: string; label: string }>,
): Map<string, string> {
  const m = new Map<string, string>();
  for (const l of labels) {
    m.set(l.label, l.name);
    m.set(l.name, l.name);
  }
  return m;
}

/**
 * 批量计算规则占比(合计恒为 100,最大余数法修正舍入)。
 *
 * 为什么不用 computeRadio 逐条算:
 *  - 逐条 round 可能合计 ≠ 100(如 33+33+33=99),生成卡片校验"合计必须 100%"会卡住;
 *  - total 应基于"提取出的规则样本总数",而不是包含被跳过样本的 totalRecords
 *    (未知 label 样本会稀释比例,导致合计 < 100)。
 *
 * 算法:每条先取 floor(精确值),剩余 100 - Σfloor 按小数部分降序逐条 +1。
 * 例:[1/3, 1/3, 1/3] → [33, 33, 34]。
 */
export function computeRadios(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 0 || counts.length === 0) return [];
  if (counts.length === 1) return [100];

  const exact = counts.map((c) => (c / total) * 100);
  const result = exact.map((e) => Math.floor(e));
  let remainder = 100 - result.reduce((a, b) => a + b, 0);
  // 小数部分大的先补 1(最大余数法)
  const order = exact
    .map((e, i) => ({ i, frac: e - result[i]! }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (remainder <= 0) break;
    result[i]! += 1;
    remainder -= 1;
  }
  return result;
}

/** 把任意顶层结构归一为 record 数组(支持 [records] 和 { data: [records] }) */
function normalizeRecords(raw: unknown): LSRecordLike[] {
  if (Array.isArray(raw)) return raw as LSRecordLike[];
  if (
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as { data?: unknown }).data)
  ) {
    return ((raw as { data: unknown[] }).data) as LSRecordLike[];
  }
  return [];
}

/**
 * 从 LS JSON 提取规则。
 * 每条 record 的已知 label 序列(英文 name)作为步骤;未知 label 单独收集。
 * 解析失败时抛错(由 dialog toast 捕获),不静默吞掉。
 */
export function extractRules(
  rawJson: unknown,
  opts: ExtractOptions,
): ExtractedRule[] {
  const records = normalizeRecords(rawJson);
  const lookup = buildLabelLookup(opts.labels);
  // name(英文)→ 中文显示名(label),规则名始终用中文序列(标注文件可能是英文或中文)
  const nameToLabel = new Map<string, string>();
  for (const l of opts.labels) nameToLabel.set(l.name, l.label ?? l.name);

  // 第一遍:收集每条 record 的 label 序列(英文名 + 中文名)+ 该 record 涉及的未知 label
  const recordSeqs: Array<{
    names: string[];
    chinese: string[];
    unknowns: string[];
  }> = [];

  for (const record of records) {
    const annotation = record.annotations?.[0];
    if (!annotation) continue;

    const names: string[] = [];
    const chinese: string[] = [];
    const unknowns: string[] = [];
    for (const r of annotation.result ?? []) {
      const lbls = r.value?.labels;
      if (!Array.isArray(lbls)) continue;
      for (const label of lbls) {
        if (typeof label !== "string") continue;
        const name = lookup.get(label);
        if (!name) {
          unknowns.push(label);
          continue;
        }
        names.push(name);
        // 规则名用 label 表的中文显示名(标注是英文时也能拼出中文规则名)
        chinese.push(nameToLabel.get(name) ?? label);
      }
    }
    if (names.length > 0) recordSeqs.push({ names, chinese, unknowns });
  }

  // 第二遍:按英文序列去重,组装步骤(只存 name)+ 规则名(中文序列)
  interface Group {
    steps: AddrSimStep[];
    ruleName: string;
    count: number;
    unknownLabels: Set<string>;
  }
  const groups = new Map<string, Group>();

  for (const seq of recordSeqs) {
    const key = seq.names.join("||");
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      for (const u of seq.unknowns) existing.unknownLabels.add(u);
    } else {
      groups.set(key, {
        steps: seq.names.map((n) => ({ name: n })),
        ruleName: seq.chinese.join("-") || "提取规则",
        count: 1,
        unknownLabels: new Set(seq.unknowns),
      });
    }
  }

  return Array.from(groups.values())
    .map((g) => ({
      name: g.ruleName,
      steps: g.steps,
      count: g.count,
      unknownLabels: Array.from(g.unknownLabels),
    }))
    .sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-Hans-CN"),
    );
}

/**
 * 解析统计:返回总样本数 / 去重后规则数 / 被忽略的未知 label 数。
 * 未知 label 是文件中所有未知 label 的并集。
 */
export interface ExtractSummary {
  totalRecords: number;
  ruleCount: number;
  /** 文件中出现但不在 label 表的 label 名(去重后) */
  unknownLabels: string[];
}

/**
 * 解析统计:每条规则的 unknownLabels 已由 extractRules 绑定到具体 record,
 * 这里只做"所有规则的未知 label 并集(insertion 顺序)"。
 */
export function summarizeExtraction(
  rawJson: unknown,
  _opts: ExtractOptions,
  rules: ExtractedRule[],
): ExtractSummary {
  return {
    totalRecords: normalizeRecords(rawJson).length,
    ruleCount: rules.length,
    unknownLabels: rules.reduce<string[]>(
      (acc, r) => {
        for (const u of r.unknownLabels) {
          if (!acc.includes(u)) acc.push(u);
        }
        return acc;
      },
      [],
    ),
  };
}
