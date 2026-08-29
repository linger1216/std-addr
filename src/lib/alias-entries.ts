/**
 * 别名多值归一工具 —— 把任意形态的"别名 JSON"解析为字符串数组(1-N 条)。
 *
 * 与 parseAddressEntries 共用 normalizeAddress 底层,但语义独立:
 *   - 入参是 JSON 字符串时先尝试 JSON.parse 再归一
 *   - 兼容历史脏数据:老 schema(String 列)可能存为单字符串或字符串数组
 *   - 过滤空字符串 / 非字符串元素
 *
 * 规则(与 parseAddressEntries 一致):
 *   - null / undefined / 空串    → []
 *   - string 能解析成 JSON 数组  → 按解析结果归一
 *   - string 解析失败            → [string](单条别名)
 *   - array                      → 递归展平,只保留非空 string
 *   - 其他                        → []
 */

import { normalizeAddress } from "./format";

export function parseAliasEntries(value: unknown): string[] {
  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return [];
    try {
      return normalizeAddress(JSON.parse(s));
    } catch {
      return normalizeAddress(s);
    }
  }
  return normalizeAddress(value);
}

/** 表单别名条目形态(对齐 RHF useFieldArray 习惯) */
export type AliasEntry = { value: string };

/**
 * 表单条目去空 + 去重(保留首次出现顺序)。
 * 回车添加前后都过一遍,保证最终列表无空值、无重复。
 */
export function dedupAliases(entries: AliasEntry[]): AliasEntry[] {
  const seen = new Set<string>();
  const out: AliasEntry[] = [];
  for (const e of entries) {
    const v = e.value.trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push({ value: v });
  }
  return out;
}

/**
 * 草稿展开:用户输入框里的字符串 → 待添加的字符串列表。
 *
 * 规则(按以下顺序匹配):
 *  - 空串 / 纯空白                   → []
 *  - 以 "[" 开头且能解析为 JSON 数组  → 元素转字符串、trim、过滤空
 *    (非法 JSON 时不抛错,退回下方逗号拆分)
 *  - 否则                            → 按中英文逗号拆分,trim,过滤空
 *
 * 与 parseAliasEntries 的差异:
 *   parseAliasEntries 解析"持久化的 JSON 列"(已知是数组格式),无需展开逗号;
 *   parseDraftAliases 解析"用户输入的草稿",用户可能输 `a,b,c` 也可能 `["a","b"]`,
 *   因此同时支持逗号拆分与 JSON 数组两种形态。
 */
export function parseDraftAliases(draft: string): string[] {
  const raw = draft.trim();
  if (!raw) return [];

  // 优先尝试 JSON 数组(如 '["x","y"]');非数组或解析失败 → 退回逗号拆分
  if (raw.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((v): v is string | number => typeof v === "string" || typeof v === "number")
          .map((v) => String(v).trim())
          .filter(Boolean);
      }
    } catch {
      // 不是合法 JSON,继续按逗号拆分
    }
  }

  // 逗号拆分(中英文逗号)
  return raw
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
