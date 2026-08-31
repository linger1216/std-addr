/**
 * 标准地址库 · 地址预处理(纯函数,可测)。
 *
 * 从旧架构 stdaddr-service/server/services/standardizeService.js 迁移:
 * 9 条正则策略原样保留(括号清理/不可见字符/楼层室号楼栋路号脏字符等)。
 */

/** 预处理策略列表(顺序敏感,逐条应用) */
export const PREPROCESS_STRATEGIES: Array<(s: string) => string> = [
  // 1. 去除括号及其内容(中文和英文)
  (s) => s.replace(/[（(][^）)]*[）)]/g, ""),
  // 2. 去除未闭合括号
  (s) => s.replace(/[（(][^）)]*$/g, ""),
  // 3. 去除不可见字符(空格、Tab、换行、xa0、零宽空格等)
  (s) => s.replace(/[\s\xa0\u200b]+/g, ""),
  // 4. 去除井号
  (s) => s.replace(/#/g, ""),
  // 5. 清理室号前的脏字符(仅清理 ASCII junk,保留中文和数字之间的连接)
  // 例：402-室 → 402室；1-2室 → 1-2室；1号单元室 → 1号室
  (s) => s.replace(/(\d)(?=[^\d一-龥]室)/g, "$1"),
  (s) => s.replace(/(?<=[^\d])(\d)[^\da-zA-Z一-龥]*室/g, "$1室"),
  // 5.5 清理 "数字-室"(单连字符,无其他数字)：402-室 → 402室
  (s) => s.replace(/(\d)-(?=室)/g, "$1"),
  // 6. 清理楼栋前的脏字符
  (s) => s.replace(/(\d)(?=[^\d一-龥](?:号楼|栋|幢))/g, "$1"),
  (s) => s.replace(/(?<=[^\d])(\d)[^\d]*(号楼|栋|幢)/g, "$1$2"),
  // 7. 清理单元前的脏字符
  (s) => s.replace(/(\d)(?=[^\d一-龥]单元)/g, "$1"),
  (s) => s.replace(/(?<=[^\d])(\d)[^\d]*单元/g, "$1单元"),
  // 8. 清理路号前的脏字符
  (s) => s.replace(/(\d)(?=[^\d一-龥](?:号|弄))/g, "$1"),
  (s) => s.replace(/(?<=[^\d])(\d)[^\d]*(号|弄)/g, "$1$2"),
];

/** 应用全部预处理策略;空/非字符串原样返回 */
export function preprocessRaw(raw: string | null | undefined): string {
  if (!raw) return raw ?? "";
  let result = raw;
  for (const strategy of PREPROCESS_STRATEGIES) {
    result = strategy(result);
  }
  return result;
}

/** 中文数字/零 → 阿拉伯数字(逐字替换,十位用单字转换不展开:十二 → 1二,旧架构如此) */
export function normalizeChineseDigit(str: string | null | undefined): string {
  if (!str) return "";
  const map: Record<string, string> = {
    一: "1", 二: "2", 三: "3", 四: "4", 五: "5",
    六: "6", 七: "7", 八: "8", 九: "9", 零: "0",
  };
  return str.replace(/[一二三四五六七八九零]/g, (c) => map[c] ?? c);
}