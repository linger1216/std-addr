/**
 * 从 Label Studio 标注文件提取地址模拟规则(纯客户端,纯函数,可测)。
 *
 * 输入:LS 标注 JSON(数组或 {data: [...]}),每条 record 含 annotations[0].result[].value.labels
 *      其中 labels 数组元素是中文 label.label(对应项目 label 表的 label 列),text 是标注值。
 * 输出:ExtractedRule[] —— 按 steps 序列去重,带出现次数 + 推荐规则名。
 *
 * 命名规则:
 *   - 推荐 name = steps.map(s => s.name).join("-")(要素中文名拼接,顺序敏感)
 *   - steps 为空数组的 record 跳过
 *
 * 数据来源推导(逐 label,优先级从高到低):
 *   1. label.name 命中实体表(road/community/village/poi) → randomValue = 该实体表
 *   2. 该 label 在文件中出现的值全部是数字:
 *      - 阿拉伯数字(如 "1500号")→ randomNumber = { format: "arabic", minDigits, maxDigits }
 *        (位数取所有值的最短/最长)
 *      - 中文数字(如 "一百五十号")→ randomNumber = { format: "chinese" }
 *   3. 剩余情况 → 自定义列表:值的去重列表写入 customValue.list(不限制条数)
 *   4. 兜底(无值 / 值太多)→ randomValue = { name: "road" } 占位
 *
 * 步骤结构(无 prefix/suffix,skipRate: 0):
 *   { name: <中文 label.label>, randomValue | randomNumber | customValue, skipRate: 0 }
 */

import {
  addrSimSourceNames,
  type AddrSimSourceName,
  type AddrSimStep,
} from "@/lib/validators/addr-sim";

/** 提取出的候选规则(供前端预览 + 勾选导入) */
export interface ExtractedRule {
  /** 推荐规则名:要素1-要素2-…(中文 label.label 顺序连接) */
  name: string;
  /** 步骤骨架(来源已按 实体表/数字/自定义 推导) */
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
  /**
   * 哪些 label.name 视为实体表 key(命中后 randomValue.name 用该实体表)。
   * 默认取 addrSimSourceNames 的全部。
   */
  entitySourceNames?: ReadonlyArray<AddrSimSourceName>;
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

/** 地址数字常见的单位后缀(用于数字识别时剥离) */
const NUMERIC_SUFFIX =
  "号楼层栋室单元组队巷弄座幢排门房间户";

/** 中文数字字符 */
const CN_DIGITS = "零一二三四五六七八九十百千万两";

/**
 * 判断 text 是否为"阿拉伯数字 + 常见单位后缀"形态(如 "1500"、"1500号")。
 * 返回提取出的纯数字串;不匹配返回 null。
 */
export function extractArabicDigits(text: string): string | null {
  // 后缀字符集与 NUMERIC_SUFFIX 常量保持一致(单一事实来源)
  const m = new RegExp(`^(\\d+)[${NUMERIC_SUFFIX}]*$`).exec(text.trim());
  return m ? m[1]! : null;
}

/** 判断 text 是否为"中文数字 + 常见单位后缀"形态(如 "十五号"、"一百五十")。 */
export function isChineseNumeric(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const re = new RegExp(`^[${CN_DIGITS}]+[${NUMERIC_SUFFIX}]*$`);
  return re.test(t);
}

/** 把 label.label(中文) 映射到 label.name(英文);查不到返回 null */
function buildLabelLookup(
  labels: Array<{ name: string; label: string }>,
): Map<string, string> {
  const m = new Map<string, string>();
  for (const l of labels) m.set(l.label, l.name);
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
 * 按精细化规则推导单个 label 的步骤结构(实体表 → 数字 → 自定义 → 兜底)。
 */
function buildStepForLabel(
  label: string,
  name: string,
  entitySet: Set<string>,
  values: string[],
): AddrSimStep {
  // 1. 实体表优先(entitySet 内的 name 一定是合法实体表 key)
  if (entitySet.has(name)) {
    return {
      name: label,
      randomValue: { name: name as AddrSimSourceName },
      skipRate: 0,
    };
  }

  // 2. 数字识别(所有值同形态才按数字处理)
  const digits = values.map(extractArabicDigits);
    const allArabic = digits.every((d) => d !== null);
    if (allArabic) {
      const lens = digits
        .filter((d): d is string => d !== null)
        .map((d) => d.length);
      return {
        name: label,
        randomNumber: {
          format: "arabic",
          minDigits: Math.min(...lens),
          maxDigits: Math.max(...lens),
        },
        skipRate: 0,
      };
    }
    const allChinese = values.every(isChineseNumeric);
    if (allChinese) {
      // 中文数字:位数范围粗略取最长值去除单位后的字符数(1~9 封顶)
      const maxLen = Math.max(
        ...values.map((v) => v.trim().replace(new RegExp(`[${NUMERIC_SUFFIX}]*$`), "").length),
      );
      return {
        name: label,
        randomNumber: {
          format: "chinese",
          minDigits: 1,
          maxDigits: Math.min(9, Math.max(1, maxLen)),
        },
        skipRate: 0,
      };
    }
    // 3. 自定义列表:值去重后全部写入 customValue.list
    return { name: label, customValue: { list: values }, skipRate: 0 };

  // 4. 兜底:road 占位(值太多放弃自定义;后续用户可手动调整)
  return { name: label, randomValue: { name: "road" }, skipRate: 0 };
}

/**
 * 从 LS JSON 字符串提取规则。
 * 解析失败时抛错(由 dialog toast 捕获),不静默吞掉。
 */
export function extractRules(
  rawJson: unknown,
  opts: ExtractOptions,
): ExtractedRule[] {
  const records = normalizeRecords(rawJson);
  const lookup = buildLabelLookup(opts.labels);
  const entitySet = new Set<string>(
    opts.entitySourceNames ?? addrSimSourceNames,
  );

  // 第一遍:收集每个已知 label 出现过的值(去重保序)+ 每条 record 的 label 序列(顺序)+ 该 record 涉及的未知 label
  const valueMap = new Map<string, string[]>(); // label.label → 去重值列表
  const recordLabels: string[][] = [];
  const recordUnknowns: string[][] = []; // 与 recordLabels 平行

  for (const record of records) {
    const annotation = record.annotations?.[0];
    if (!annotation) continue;

    const labels: string[] = [];
    const unknownHere: string[] = [];
    for (const r of annotation.result ?? []) {
      const lbls = r.value?.labels;
      if (!Array.isArray(lbls)) continue;
      for (const label of lbls) {
        if (typeof label !== "string") continue;
        const name = lookup.get(label);
        if (!name) {
          unknownHere.push(label);
          continue;
        }
        labels.push(label);
        // 收集标注值(以空格/逗号分隔多值展开,避免整句误收集)
        const text =
          typeof r.value?.text === "string" ? r.value.text.trim() : "";
        if (!text) continue;
        const list = valueMap.get(label) ?? [];
        if (!list.includes(text)) list.push(text);
        valueMap.set(label, list);
      }
    }
    if (labels.length > 0) {
      recordLabels.push(labels);
      recordUnknowns.push(unknownHere);
    }
  }

  // 第二遍:为每个 label 生成步骤模板(同 label 全局同一来源)
  const stepTemplates = new Map<string, AddrSimStep>();
  for (const label of valueMap.keys()) {
    const name = lookup.get(label)!;
    stepTemplates.set(label, buildStepForLabel(label, name, entitySet, valueMap.get(label) ?? []));
  }

  // 第三遍:组装 record → steps 序列并去重
  interface Group {
    steps: AddrSimStep[];
    count: number;
    unknownLabels: Set<string>;
  }
  const groups = new Map<string, Group>();

  for (let i = 0; i < recordLabels.length; i++) {
    const labels = recordLabels[i]!;
    const unknownHere = recordUnknowns[i] ?? [];
    const steps = labels.map((l) => {
      const tpl = stepTemplates.get(l);
      // 防御:从未收集到值的 label(理论不会走到,因为收集遍历覆盖所有已知 label)
      if (tpl) return tpl;
      return buildStepForLabel(l, lookup.get(l)!, entitySet, []);
    });
    if (steps.length === 0) continue;

    // 同一 label 序列 = 同一来源(来源由全局值决定),直接用 name 序列做 key
    const key = steps.map((s) => s.name).join("||");
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      for (const u of unknownHere) existing.unknownLabels.add(u);
    } else {
      groups.set(key, {
        steps,
        count: 1,
        unknownLabels: new Set(unknownHere),
      });
    }
  }

  return Array.from(groups.entries())
    .map(([key, g]) => ({
      name: key.split("||").join("-") || "提取规则",
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