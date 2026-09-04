/**
 * 通用展示层格式化 helper —— 任何 CRUD 模块复用。
 *
 * 当前 helper 列表:
 *   - formatDateTime: Date | string | null | undefined → zh-CN 本地化字符串
 *   - formatShortDate: Date | string | null | undefined → YYYY-MM-DD
 *   - formatJson: unknown → 格式化 JSON 文本,不可序列化时降级
 *   - normalizeAddress: unknown → 字符串数组(地址 JSON 字段归一)
 *   - parseAddressEntries: unknown → 字符串数组(字符串先按 JSON 解析再归一)
 *   - jsonText: unknown → 可展示文本(字符串原样,null/对象等 → 占位符)
 *   - orEmpty: null | undefined → PLACEHOLDER_EMPTY
 */

import { PLACEHOLDER_EMPTY } from "./constants";

/** zh-CN 本地化日期时间,失败兜底原值 */
export function formatDateTime(d: Date | string | null | undefined): string {
  if (d == null) return PLACEHOLDER_EMPTY;
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toLocaleString("zh-CN", { hour12: false });
}

/** YYYY-MM-DD 短日期 */
export function formatShortDate(d: Date | string | null | undefined): string {
  if (d == null) return PLACEHOLDER_EMPTY;
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return PLACEHOLDER_EMPTY;
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/**
 * 把任意 JSON 值 → 缩进 2 空格的字符串。
 * - string 输入: 尝试先 JSON.parse 再 stringify(归一),失败则原样返回
 * - null / undefined: 占位符
 * - 其他: JSON.stringify(v, null, 2);不可序列化降级 toString
 */
export function formatJson(v: unknown): string {
  if (v === null || v === undefined) return PLACEHOLDER_EMPTY;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return PLACEHOLDER_EMPTY;
    try {
      return JSON.stringify(JSON.parse(s), null, 2);
    } catch {
      return s;
    }
  }
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return Object.prototype.toString.call(v);
  }
}

/**
 * 把任意形态的"地址 JSON"(string / array / object / null)归一化为字符串数组,
 * 给表格按行渲染用。无法归一化的返回空数组(交给调用方决定 fallback 显示什么)。
 *
 * 规则:
 *  - null / undefined    → []
 *  - string              → [string]
 *  - array               → 递归展平每个元素,只保留 string
 *  - number / boolean    → [String(v)]
 *  - { value: string }   → [value](地址条目对象,如子区域地址 [{ value: "..." }])
 *  - object / 其他       → []
 */
export function normalizeAddress(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === "string") return value ? [value] : [];
  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      typeof item === "string" && item ? [item] : normalizeAddress(item),
    );
  }
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  // 地址条目对象(如子区域 address:[{ value: "..." }])→ 取 value
  if (typeof value === "object") {
    const v = (value as Record<string, unknown>).value;
    if (typeof v === "string" && v) return [v];
    return [];
  }
  return [];
}

/**
 * 把任意形态的"地址 JSON"解析为条目数组(1-N 条),供详情/表单列表编辑用。
 * 与 normalizeAddress 的区别:入参是 JSON 字符串时先尝试 JSON.parse 再归一,
 * 避免拿到 `["a","b"]` 这种文本时被当成单条字符串展示。
 *
 * 规则:
 *  - null / undefined / 空串 → []
 *  - string 且能解析成 JSON  → 按解析结果再走 normalizeAddress
 *  - string 解析失败         → [string](当成单条地址)
 *  - 其余                    → normalizeAddress
 */
export function parseAddressEntries(value: unknown): string[] {
  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return [];
    try {
      return normalizeAddress(JSON.parse(s));
    } catch {
      return [s];
    }
  }
  return normalizeAddress(value);
}

/**
 * JSON 任意值 → 可展示文本:字符串原样返回;null / 对象 / 数组等 → 占位符。
 * 用于库里的 JSON 列(如 communities.alias)在列表/详情的展示。
 */
export function jsonText(v: unknown): string {
  return typeof v === "string" ? v : PLACEHOLDER_EMPTY;
}