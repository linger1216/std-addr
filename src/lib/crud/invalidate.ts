/**
 * CRUD 模块查询失效(纯函数,便于单测)。
 *
 * 约定每个 CRUD 模块都有 list / stats / getById 三个查询:
 *  - list:    列表分页 —— 增删改后必须刷新
 *  - stats:   顶部指标卡
 *  - getById: 详情/编辑表单 —— 修改后同样必须失效!
 *    漏掉它会导致:保存成功后表格已是最新数据,
 *    但再次打开编辑表单时 React Query 在 staleTime 内直接命中 fresh 缓存,
 *    表单里还是旧数据(必须整页刷新才能看到)。
 */

export type InvalidateFn = () => Promise<unknown>;

export type NamespaceInvalidateUtils = {
  list?: { invalidate: InvalidateFn };
  stats?: { invalidate: InvalidateFn };
  getById?: { invalidate: InvalidateFn };
};

export type UtilsShape = Record<string, NamespaceInvalidateUtils | undefined>;

/** CRUD 模块的查询 procedure 名(全部参与失效) */
const QUERY_PROCEDURES = ["list", "stats", "getById"] as const;

/** 失效给定命名空间下的全部数据查询(缺失的 procedure 自动跳过) */
export async function invalidateAll(
  utils: UtilsShape,
  keys: string[],
): Promise<void> {
  await Promise.all(
    keys.flatMap((ns) => {
      const nsUtils = utils[ns];
      if (!nsUtils) return [];
      const ops: Array<Promise<unknown>> = [];
      for (const p of QUERY_PROCEDURES) {
        const inv = nsUtils[p]?.invalidate;
        if (inv) ops.push(inv());
      }
      return ops;
    }),
  );
}