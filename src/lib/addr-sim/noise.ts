/**
 * 干扰(noise)注入 —— 纯函数、rng 可注入(便于单测)。
 *
 * 目的:生成用于训练的地址样本时注入真实数据常见的"干扰项":
 *  - 错别字(typo):把某个字替换成形近/常见错字
 *  - 少字/漏字(drop):删掉某个字
 *  - 相邻互换(swap):模拟打字/录入时相邻字颠倒
 *
 * 由 generateStepValue 在前后缀拼接完成后,按步骤的 noiseRate 概率调用。
 */

/** 随机数源(与 generator 共用形态) */
export type NoiseRng = () => number;

/** 常见形近/错别字替换对(源字 → 易错字) */
const TYPO_MAP: ReadonlyArray<readonly [string, string]> = [
  ["市", "布"],
  ["路", "陆"],
  ["号", "皓"],
  ["区", "去"],
  ["县", "悬"],
  ["街", "衔"],
  ["道", "到"],
  ["村", "寸"],
  ["镇", "侦"],
  ["园", "圆"],
  ["花", "华"],
  ["江", "汇"],
  ["门", "们"],
  ["东", "冬"],
  ["南", "男"],
  ["大", "太"],
  ["中", "申"],
  ["人", "入"],
  ["王", "玉"],
  ["本", "木"],
];

/** 无对应替换对时用的常用字池(模拟随机输错) */
const TYPO_FALLBACK = "路市号区县街村园花江门东南中大小安";

/** 删掉 index 处的字(少字/漏字) */
function dropChar(s: string, i: number): string {
  return s.slice(0, i) + s.slice(i + 1);
}

/** 交换 index 与 index+1 两个字(相邻颠倒) */
function swapChars(s: string, i: number): string {
  if (i + 1 >= s.length) return s;
  return s.slice(0, i) + s[i + 1]! + s[i]! + s.slice(i + 2);
}

/** 把 index 处的字替换为形近/常见错字 */
function typoChar(s: string, i: number, rng: NoiseRng): string {
  const ch = s[i]!;
  const rep = TYPO_MAP.find(([a]) => a === ch)?.[1];
  if (rep) return s.slice(0, i) + rep + s.slice(i + 1);
  const alt = TYPO_FALLBACK[Math.floor(rng() * TYPO_FALLBACK.length)];
  return s.slice(0, i) + (alt ?? ch) + s.slice(i + 1);
}

/**
 * 按 rate(0~100)概率对 value 注入一次干扰。
 *  - rate <= 0 或 value 为空 → 原样返回
 *  - 命中后随机选一种:丢字 / 相邻互换 / 错别字
 */
export function injectNoise(value: string, rate: number, rng: NoiseRng): string {
  if (rate <= 0 || value.length === 0) return value;
  if (rng() * 100 >= rate) return value;
  // 防御:rng 可能返回 1.0 → 下标越界,收窄到最后一个字符
  const idx = Math.min(Math.floor(rng() * value.length), value.length - 1);
  const kind = Math.floor(rng() * 3);
  if (kind === 0) return dropChar(value, idx);
  if (kind === 1) return swapChars(value, idx);
  return typoChar(value, idx, rng);
}
