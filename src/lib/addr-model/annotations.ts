/**
 * 地址模型 · 标注可视化纯函数(从页面抽出,便于单测)。
 *
 * 把结构化字段(模型输出)反查到地址原文中的精确位置,
 * 生成标注片段;字段值与原文不一致时按分隔符拆子串逐段匹配,
 * 仍不匹配则降级为 unmatched。
 */
import { FIELD_KEY_TO_ZH } from "./fields";

/** 标注片段:matched=true 时按 start/end 精确切片;false 时原文未精确匹配(降级展示) */
export interface Annotation {
  text: string;
  label: string;
  start?: number;
  end?: number;
  matched: boolean;
}

/** unknown → 可展示字符串(仅 string/number/boolean;其它返回空串) */
export function toText(v: unknown): string {
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return String(v);
  }
  return "";
}

/** 字段值按分隔符拆子串(逗号/顿号/分号/空格),便于在原文中逐段匹配 */
export function splitFieldValue(v: string): string[] {
  return v
    .split(/[,，、;；\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** 从原文查找某子串的可用位置(跳过已占用片段) */
export function findUnusedPosition(
  full: string,
  part: string,
  used: Set<number>,
): number {
  let idx = full.indexOf(part);
  while (idx >= 0 && used.has(idx)) {
    idx = full.indexOf(part, idx + 1);
  }
  return idx;
}

/**
 * 由结构化字段反查地址原文,生成标注分片(start/end 精确切片)。
 *  - 字段值整体找不到时,按分隔符拆子串逐段匹配(如 community="A,B" → 两段分别命中);
 *  - 拆后仍无法匹配的字段降级为 unmatched;
 *  - 保证"每字段至少一个片段"(要素数与结构化字段数一致)。
 */
export function buildAnnotations(
  full: string,
  data: Record<string, unknown>,
): Annotation[] {
  const out: Annotation[] = [];
  const used = new Set<number>();
  for (const [key, raw] of Object.entries(data)) {
    const text = toText(raw);
    if (!text) continue;
    const label = FIELD_KEY_TO_ZH[key] ?? key;
    const parts = splitFieldValue(text);
    let matchedAny = false;
    for (const part of parts) {
      const idx = findUnusedPosition(full, part, used);
      if (idx < 0) continue;
      used.add(idx);
      out.push({
        text: part,
        label,
        start: idx,
        end: idx + part.length,
        matched: true,
      });
      matchedAny = true;
    }
    if (!matchedAny) {
      // 整字段(含子串)都未匹配 → 降级展示模型原值
      out.push({ text, label, matched: false });
    }
  }
  // matched 按原文位置排序,未匹配的放最后
  return out.sort((a, b) =>
    a.matched === b.matched
      ? (a.start ?? Number.MAX_SAFE_INTEGER) - (b.start ?? Number.MAX_SAFE_INTEGER)
      : a.matched
        ? -1
        : 1,
  );
}