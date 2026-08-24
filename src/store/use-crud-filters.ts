"use client";

import { create, type StateCreator, type StoreApi, type UseBoundStore } from "zustand";

/**
 * 通用 CRUD 筛选 store 的状态形状。
 * 任意筛选字段都以 string 保存(空串代表"未筛选")。
 */
export type CrudFilters = Record<string, string>;

type CrudFiltersState = {
  /** 当前正在编辑(未提交)的筛选值 */
  draft: CrudFilters;
  /** 已提交、用于触发查询的筛选值 */
  committed: CrudFilters;
  setDraft: (next: CrudFilters) => void;
  patchDraft: (partial: Partial<CrudFilters>) => void;
  commit: () => void;
  reset: () => void;
};

export type CrudFiltersHook = UseBoundStore<StoreApi<CrudFiltersState>>;

/**
 * ponytail: 单一 store 工厂。所有 CRUD 模块共享此模式 —
 * 搜索框改变 -> setDraft/patchDraft;点搜索 -> commit;点重置 -> reset。
 * 每个模块调用 createCrudFiltersStore(empty) 拿到自己独立的 hook 实例。
 */
export function createCrudFiltersStore(empty: CrudFilters): CrudFiltersHook {
  const initializer: StateCreator<CrudFiltersState> = (set, get) => ({
    draft: { ...empty },
    committed: { ...empty },
    setDraft: (next) => set({ draft: { ...empty, ...next } }),
    patchDraft: (partial) =>
      set({ draft: { ...get().draft, ...partial } as CrudFilters }),
    commit: () => set({ committed: { ...get().draft } }),
    reset: () => set({ draft: { ...empty }, committed: { ...empty } }),
  });
  return create<CrudFiltersState>()(initializer);
}