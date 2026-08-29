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
