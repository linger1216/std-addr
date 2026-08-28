/**
 * 村名归一:把 region 节点里的"村委会/村民委员会/村委/村"等后缀剥掉,
 * 得到具体的"村名"(如 "李巷")。
 *
 * 后缀按"最长优先"剥除,避免"村民委员会"被"村委"提前剥成"李巷民委员会"。
 *
 * 边界:
 *   - 空串 / 无后缀 → 原样返回(交给上游决定是否跳过)
 *   - 只有"村"这种单字后缀 → 也剥(让"某村"→"某"),兜底以应对
 *     region 节点名称不规范(如仅写"某村"而非"某村委会")的情况
 */

const VILLAGE_SUFFIXES = [
  "村民委员会",
  "村委会",
  "村委",
  "村",
] as const;

export function stripVillageSuffix(name: string): string {
  for (const suffix of VILLAGE_SUFFIXES) {
    if (name.endsWith(suffix)) {
      return name.slice(0, -suffix.length);
    }
  }
  return name;
}
