/**
 * useCrudMutations —— 统一 CRUD mutation 套件。
 *
 * 消除每个 mutation 重复的:
 *   - Promise.all([invalidate list, invalidate stats])
 *   - onSuccess toast 文案
 *   - onError 错误归一(toApiError)
 *   - 关闭 dialog / 清选中 等副作用
 *
 * 用法:
 *   const mut = useCrudMutations({
 *     utils: api.useUtils(),
 *     procedures: {
 *       create: api.community.create,
 *       update: api.community.update,
 *       delete:  api.community.delete,
 *       deleteMany: api.community.deleteMany,
 *     },
 *     invalidateKeys: ["community"],
 *     messages: {
 *       createSuccess: "小区已创建",
 *       updateSuccess: "小区已更新",
 *       deleteSuccess: "已删除",
 *       deleteManySuccess: (n) => `已删除 ${n} 条`,
 *     },
 *     hooks: {
 *       onAfterCreate: closeForm,
 *       onAfterDelete: cancelDelete,
 *     },
 *   });
 *
 *   mut.create.mutate(input);
 *   mut.update.mutate(input);
 *   mut.remove.mutate({ id });
 *   mut.removeMany.mutate({ ids });
 *
 * 设计要点:
 *   - 4 个 mutation(create/update/delete/deleteMany)全部必填 —— useMutation 是 Hook,
 *     Rules of Hooks 要求无条件、按固定顺序调用,不能在 useMemo/useEffect 里包一层,
 *     所以这里直接在顶层调用。缺少 procedure 的模块请传完整的 4 个。
 *   - invalidateKeys 字符串数组,内部调 utils[ns].list.invalidate() + stats.invalidate()
 *   - hooks.onAfterXxx 是可选副作用,通常是关闭 dialog / clearSelection / cancelDelete
 *   - 错误统一走 toApiError + toast.error(可通过 onError 全局覆盖)
 *   - 不锁死 create input 形状,完全交由 tRPC 推断(泛型守门)
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/prefer-nullish-coalescing */

"use client";

import { toast } from "sonner";

import { toApiError } from "@/lib/api/error";

/** 复用 tRPC 的 utils.invalidate 形态(规避硬绑 router 类型) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-indexed-object-style
type MinimalUtils = Record<string, any>;

/** 单个 mutation 引用:只用 mutate + isPending,其他不暴露 */
type MinimalMutation<I> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useMutation: (opts: any) => {
    mutate: (input: I, opts?: any) => void;
    mutateAsync: (input: I, opts?: any) => Promise<unknown>;
    isPending: boolean;
    reset?: () => void;
  };
};

/** 4 个 procedure 引用 —— 全部必填(见顶部设计要点) */
type ProcedureMap = {
  create: MinimalMutation<any>;
  update: MinimalMutation<any>;
  delete: MinimalMutation<{ id: string }>;
  deleteMany: MinimalMutation<any>;
};

export type UseCrudMutationsOptions<TMessages extends {
  createSuccess?: string;
  updateSuccess?: string;
  deleteSuccess?: string;
  deleteManySuccess?: (n: number) => string;
}> = {
  /** tRPC utils(api.useUtils() 返回值) */
  utils: MinimalUtils;
  /** 命名空间列表(如 ["community"]),用于 utils[ns].list.invalidate() + stats.invalidate() */
  invalidateKeys: string[];
  /** 4 个 procedure 引用(必填) */
  procedures: ProcedureMap;
  /** 成功提示文案(不传则用默认) */
  messages?: TMessages;
  /** 副作用钩子 —— 通常是关闭 dialog / 清选中 */
  hooks?: {
    onAfterCreate?: () => void;
    onAfterUpdate?: () => void;
    onAfterDelete?: () => void;
    onAfterDeleteMany?: () => void;
  };
  /** 错误处理(默认 toApiError + toast.error) */
  onError?: (e: unknown) => void;
};

const DEFAULT_MESSAGES = {
  createSuccess: "已创建",
  updateSuccess: "已更新",
  deleteSuccess: "已删除",
  deleteManySuccess: (n: number) => `已删除 ${n} 条`,
};

/** 默认错误处理 */
function defaultOnError(e: unknown) {
  toast.error(toApiError(e).message);
}

/** 失效 list + stats(约定所有 CRUD 模块都有这两个 procedure) */
async function invalidateAll(utils: MinimalUtils, keys: string[]) {
  await Promise.all(
    keys.flatMap((ns) => {
      const nsUtils = utils[ns];
      if (!nsUtils) return [];
      const ops: Array<Promise<unknown>> = [];
      if (nsUtils.list?.invalidate) ops.push(nsUtils.list.invalidate());
      if (nsUtils.stats?.invalidate) ops.push(nsUtils.stats.invalidate());
      return ops;
    }),
  );
}

export function useCrudMutations(opts: UseCrudMutationsOptions<any>) {
  const {
    utils,
    invalidateKeys,
    procedures,
    messages = {},
    hooks = {},
    onError = defaultOnError,
  } = opts;

  const msg = { ...DEFAULT_MESSAGES, ...messages };

  // Rules of Hooks:useMutation 必须无条件、固定顺序调用,直接在顶层展开。
  const create = procedures.create.useMutation({
    onSuccess: async () => {
      await invalidateAll(utils, invalidateKeys);
      toast.success(msg.createSuccess);
      hooks.onAfterCreate?.();
    },
    onError,
  });

  const update = procedures.update.useMutation({
    onSuccess: async () => {
      await invalidateAll(utils, invalidateKeys);
      toast.success(msg.updateSuccess);
      hooks.onAfterUpdate?.();
    },
    onError,
  });

  const remove = procedures.delete.useMutation({
    onSuccess: async () => {
      await invalidateAll(utils, invalidateKeys);
      toast.success(msg.deleteSuccess);
      hooks.onAfterDelete?.();
    },
    onError,
  });

  const removeMany = procedures.deleteMany.useMutation({
    onSuccess: async (res: unknown) => {
      await invalidateAll(utils, invalidateKeys);
      const count = (res as { count?: number } | undefined)?.count ?? 0;
      toast.success(msg.deleteManySuccess(count));
      hooks.onAfterDeleteMany?.();
    },
    onError,
  });

  return {
    create,
    update,
    remove,
    removeMany,
    /** 任一 mutation 是否正在进行(用于禁用按钮/显示 loading) */
    isMutating: Boolean(
      create.isPending ||
        update.isPending ||
        remove.isPending ||
        removeMany.isPending,
    ),
  };
}