/**
 * 标签输入草稿解析 —— 业务无关纯函数(TagInput 等数组输入组件使用)。
 *
 * 用户可能在输入框里粘贴:
 *  - 逗号分隔的多个值:`a,b,c` → [a, b, c]
 *  - JSON 字符串数组:`["x","y"]` → [x, y]
 *  - N->M 范围语法:`1->9` → [1, 2, ..., 9] / `一->二十` → ["一", "二", ..., "二十"]
 *    (输出沿用起点格式;混合格式 / 解析失败 / 超过 9999 项时按字面字符串原样保留)
 *  - 单个值:`abc` → [abc]
 */

import { tryExpandRange } from "./addr-sim/range-expand";

/** 草稿展开:用户输入框里的字符串 → 待添加的字符串列表 */
export function parseTagDraft(draft: string): string[] {
  const raw = draft.trim();
  if (!raw) return [];

  // 优先尝试 JSON 数组(如 '["x","y"]');非数组或解析失败 → 退回逗号拆分
  let items: string[];
  if (raw.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        items = parsed
          .filter(
            (v): v is string | number =>
              typeof v === "string" || typeof v === "number",
          )
          .map((v) => String(v).trim())
          .filter(Boolean);
      } else {
        items = raw.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
      }
    } catch {
      // 不是合法 JSON,继续按逗号拆分
      items = raw.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    }
  } else {
    // 逗号拆分(中英文逗号)
    items = raw.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  }

  // 每项再尝试一次 N->M 范围展开:不识别则保留原项(不丢字)
  return items.flatMap((item) => tryExpandRange(item) ?? [item]);
}