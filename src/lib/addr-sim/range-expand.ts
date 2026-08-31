/**
 * N->M 范围展开纯函数 —— 把单条字符串 `"1->9"` 展开为 `[1,2,...,9]`。
 *
 * 用于地址模拟「自定义列表」(`customValue`)的输入框:用户粘贴 `"1->9"` / `"一->二十"`
 * 一次添加 N 条候选值,无需逐个输入。
 *
 * 输出格式遵循起点 N 的格式:
 *  - 起点阿拉伯数字 → 序列元素用阿拉伯数字
 *  - 起点中文数字   → 序列元素用 `numberToChinese` 转中文
 *  - 混合格式 / 任一端解析失败 → 不展开,整体作为字面字符串保留(`null`)
 *
 * 设计取舍:
 *  - 降序支持:`9->1` / `"九->一"` 也展开为反向序列(地址场景用得少,但实现简单,
 *    用户原意不可知时优先不丢字)
 *  - 安全上限:序列长度 <= 9999(与 `numberToChinese` 段内(0~9999)上限对齐);
 *    超过则视为不展开(避免 `1->99999999` 卡死 UI)
 *  - 两端允许 trim 与空白
 */

import { chineseToNumber, numberToChinese } from "./chinese-numeral";

/** 范围展开后的最大元素数(超过则不展开) */
export const RANGE_MAX_LIMIT = 9999;

/**
 * 判断字符串是否为纯阿拉伯数字(允许首尾空白;不允许小数 / 负号 / 其它字符)。
 * 用于在「起点 N 的格式」判定里区分阿拉伯 vs 中文。
 */
function tryParseArabic(s: string): number | null {
  const raw = s.trim();
  if (!/^[0-9]+$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > RANGE_MAX_LIMIT) return null;
  return n;
}

/** 把数字按指定格式(arabic | chinese)序列化成字符串 */
function formatNumber(n: number, format: "arabic" | "chinese"): string {
  return format === "arabic" ? String(n) : numberToChinese(n);
}

/**
 * 解析单条字符串,尝试 N->M 范围展开。
 *
 * 成功 → 返回展开后的字符串数组(降序时序列也是降序);
 * 不是范围语法 / 任一端解析失败 / 长度超限 → 返回 null(调用方应原样保留原字符串)。
 *
 * @example
 *   tryExpandRange("1->9")          // → ["1","2",...,"9"]
 *   tryExpandRange("一->二十")      // → ["一","二",...,"二十"]
 *   tryExpandRange("9->1")          // → ["9","8",...,"1"](降序也支持)
 *   tryExpandRange("1->二十")       // → null(混合格式不展开)
 *   tryExpandRange("abc")           // → null
 *   tryExpandRange("1-9")           // → null(必须用 `->` 而不是 `-`)
 */
export function tryExpandRange(text: string): string[] | null {
  const raw = text.trim();
  // 必须含 "->"(ASCII),且只有 1 处分隔符
  // 用 indexOf 而不是 split:防止 "1->2->3" 这种含多个 "->" 的也算单条范围(它本身不是合法范围)
  const sepIdx = raw.indexOf("->");
  if (sepIdx < 0) return null;
  if (raw.slice(sepIdx + 2).includes("->")) return null;

  const left = raw.slice(0, sepIdx);
  const right = raw.slice(sepIdx + 2);
  if (!left.trim() || !right.trim()) return null;

  // 判定格式:两端必须是同一种(都是阿拉伯 / 都是中文);混合格式返回 null
  const leftArabic = tryParseArabic(left);
  const leftChinese = chineseToNumber(left);
  const rightArabic = tryParseArabic(right);
  const rightChinese = chineseToNumber(right);

  let start: number;
  let end: number;
  let format: "arabic" | "chinese";
  if (leftArabic !== null && rightArabic !== null) {
    start = leftArabic;
    end = rightArabic;
    format = "arabic";
  } else if (leftChinese !== null && rightChinese !== null) {
    start = leftChinese;
    end = rightChinese;
    format = "chinese";
  } else {
    // 任一端解析失败,或两端格式不一致(例如 "1->二十")→ 原样保留
    return null;
  }

  // 序列长度保护:|start - end| + 1 ≤ 9999
  const length = Math.abs(end - start) + 1;
  if (length > RANGE_MAX_LIMIT) return null;

  // 生成序列(升序 / 降序)
  const out: string[] = [];
  if (start <= end) {
    for (let i = start; i <= end; i++) out.push(formatNumber(i, format));
  } else {
    for (let i = start; i >= end; i--) out.push(formatNumber(i, format));
  }
  return out;
}