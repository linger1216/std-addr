/**
 * 占比分配纯函数 —— 地址模拟两处场景共用:
 *
 * 1. 从数据提取导入规则后:把「现有规则(权重 = 当前占比)+ 新导入规则(权重 = 样本次数)」
 *    合并后按权重重新分配 100,保证所有规则占比合计恒为 100
 *    (需求:导入规则时按当前规则 + 新导入规则重新分配占比)。
 * 2. 规则列表「快速分配占比」:选中 N 条规则,直接设定占比和(如 60%),
 *    按当前排序递减权重(N, N-1, …, 1)自动分配 —— 第一个规则占比最多,
 *    相邻差额由权重差自动计算。
 *
 * 舍入:最大余数法 —— 每条先取 floor(精确占比),剩余余数按小数部分降序逐条 +1,
 * 保证结果合计精确等于目标值(避免 33+33+33=99 的合计缺口)。
 */

/**
 * 按权重把 total 分配到 n 个槽位(最大余数法),结果合计恒等于 total。
 *
 * - 权重为 0 / 非有限值的槽位恒分到 0;
 * - 所有权重之和 <= 0 时返回全 0;
 * - minShare > 0 时,低于下限的槽位提到 minShare,差额从「份额最大且有富余」的
 *   槽位扣减(保持合计不变);若总占比不足以满足 n × minShare,则维持现状、
 *   由调用方过滤掉低于下限的结果。
 */
export function distributeByWeights(
  weights: number[],
  total = 100,
  minShare = 0,
): number[] {
  if (weights.length === 0) return [];
  const w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const sum = w.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);

  // 精确占比 → floor + 余数按小数部分降序补 1(最大余数法)
  const exact = w.map((x) => (x / sum) * total);
  const result = exact.map((e) => Math.floor(e));
  let remainder = total - result.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => ({ i, frac: e - result[i]! }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (remainder <= 0) break;
    result[i]! += 1;
    remainder -= 1;
  }

  // 下限修正:低于 minShare 的槽位补到 minShare,差额从当前最大份额扣减
  if (minShare > 0) {
    for (let i = 0; i < result.length; i++) {
      if (result[i]! < minShare) {
        const deficit = minShare - result[i]!;
        result[i] = minShare;
        let maxIdx = -1;
        for (let j = 0; j < result.length; j++) {
          if (
            j !== i &&
            result[j]! > minShare &&
            (maxIdx === -1 || result[j]! > result[maxIdx]!)
          ) {
            maxIdx = j;
          }
        }
        if (maxIdx >= 0) result[maxIdx]! -= deficit;
        // 无富余槽位(总占比不足以满足 n × minShare)→ 维持现状,由调用方过滤
      }
    }
  }
  return result;
}

/**
 * 快速分配占比:按递减权重 N, N-1, …, 1 把 targetTotal 分给 n 条规则。
 *
 * 例:
 *   allocateByOrder(3, 60) → [30, 20, 10](第一个 > 第二个 > 第三个,差额 10)
 *   allocateByOrder(2, 100) → [67, 33]
 *
 * 权重只与「当前排序下的选中顺序」有关,与规则自身旧占比无关。
 */
export function allocateByOrder(n: number, targetTotal: number): number[] {
  if (n <= 0) return [];
  const weights = Array.from({ length: n }, (_, i) => n - i); // N, N-1, …, 1
  return distributeByWeights(weights, targetTotal, 1);
}

/**
 * 导入后占比重分配:items(权重 = 现有规则当前占比 或 新规则样本次数)分 total(默认 100)。
 * 返回 id → 占比 映射,合计恒等于 total(低于 1 的份额会被补足并从最大份额扣减)。
 */
export function allocateByWeights(
  items: Array<{ id: string; weight: number }>,
  total = 100,
): Record<string, number> {
  if (items.length === 0) return {};
  const shares = distributeByWeights(
    items.map((i) => i.weight),
    total,
    1,
  );
  const out: Record<string, number> = {};
  items.forEach((it, i) => {
    out[it.id] = shares[i]!;
  });
  return out;
}