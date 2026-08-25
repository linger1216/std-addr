/**
 * 通用展示层格式化 helper —— 任何 CRUD 模块复用。
 *
 * 当前 helper 列表:
 *   - formatDateTime: Date | string | null | undefined → zh-CN 本地化字符串
 *   - formatShortDate: Date | string | null | undefined → YYYY-MM-DD
 *   - formatJson: unknown → 格式化 JSON 文本,不可序列化时降级
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