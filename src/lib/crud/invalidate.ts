/**
 * CRUD 模块查询失效(纯函数,便于单测)。
 *
 * 失效策略:
 *  - 真实 tRPC v11 场景:useUtils() 返回的 namespace proxy 顶层自带 invalidate()(前缀匹配
 *    失效该命名空间下**所有**查询,包含 list/stats/getById 及任意自定义查询名)。
 *    注意:不能逐 procedure 判断 —— tRPC proxy 会给任意属性(如 utils.addrSim.list)
 *    都造出可调用函数,`?.invalidate` 永远非空,但失效的是不存在的 key(no-op),
 *    会漏掉 ruleList 这类非标准查询名(踩过坑)。
 *  - 因此只要顶层 invalidate 存在,直接用它(全量、彻底、不会漏)。
 *  - 非 proxy 场景(单元测试 mock)没有顶层 invalidate → 退回标准 procedure
 *    list / stats / getById 逐个失效,保持约定语义。
 */

export type InvalidateFn = () => Promise<unknown>;

export type NamespaceInvalidateUtils = {
  list?: { invalidate: InvalidateFn };
  stats?: { invalidate: InvalidateFn };
  getById?: { invalidate: InvalidateFn };
};

/**
 * 运行时 utils 形态:tRPC router proxy 顶层自带 invalidate(函数)。
 * 顶层字段用 unknown:tRPC 的实际形态是函数,但同名属性 list/stats 是对象,
 * 直接声明函数类型会与对象形态做交集导致类型崩溃。
 */
export type UtilsShape = Record<
  string,
  (NamespaceInvalidateUtils & { invalidate?: unknown }) | undefined
>;

/** 非 proxy 场景(mock)的标准 procedure 名(全部参与失效) */
const QUERY_PROCEDURES = ["list", "stats", "getById"] as const;

/** 失效给定命名空间下的全部数据查询(缺失的 procedure 自动跳过) */
export async function invalidateAll(
  utils: UtilsShape,
  keys: string[],
): Promise<void> {
  await Promise.all(
    keys.map(async (ns) => {
      const nsUtils = utils[ns];
      if (!nsUtils) return;

      // 真实 tRPC proxy:顶层 invalidate 前缀匹配整个命名空间,一次覆盖所有查询
      if (typeof nsUtils.invalidate === "function") {
        const topInvalidate = nsUtils.invalidate as InvalidateFn;
        await topInvalidate();
        return;
      }

      // 非 proxy(mock):退回标准 procedure list/stats/getById 逐个失效
      await Promise.all(
        QUERY_PROCEDURES.map((p) => {
          const inv = nsUtils[p]?.invalidate;
          return inv?.();
        }).filter((p): p is Promise<unknown> => p !== undefined),
      );
    }),
  );
}