/**
 * 小区页 UI 状态 store —— 模块私有。
 *
 * 拆分:
 *   - 筛选(搜索/区划/状态):useCommunityFilters(createCrudFiltersStore,与 road/poi/village 一致)
 *   - UI 态(分页/排序/选中/dialog open):本 store,纯展示状态
 *   - 排序 id 白名单:见 CommunitySortId
 *
 * 用法:
 *   const { page, setPage, rowSelection, openForm, closeForm } = useCommunityState();
 *   const actions = useCommunityActions();
 */

"use client";

import { create } from "zustand";
import { useShallow } from "zustand/shallow";
import type { RowSelectionState, SortingState } from "@tanstack/react-table";

/** 排序 id 白名单(对应后端 list procedure 的 sort enum) */
export type CommunitySortId =
  | "name"
  | "alias"
  | "regionName"
  | "status"
  | "createdAt";

type SortingUpdater = (old: SortingState) => SortingState;
type RowSelectionUpdater = (old: RowSelectionState) => RowSelectionState;

interface State {
  page: number;
  pageSize: number;
  sorting: SortingState;
  rowSelection: RowSelectionState;
  formOpen: boolean;
  editingId: string | null;
  detailOpen: boolean;
  detailId: string | null;
  /** 待删除单条(只存 id/name,不持有整条数据) */
  deleteRow: { id: string; name: string } | null;
  batchDeleteOpen: boolean;
  importOpen: boolean;
}

interface Actions {
  // 分页
  setPage: (p: number) => void;
  setPageSize: (n: number) => void;
  // 排序(TanStack 传 updater 或值,统一收 updater)
  setSorting: (next: SortingState | SortingUpdater) => void;
  // 选中
  setRowSelection: (next: RowSelectionState | RowSelectionUpdater) => void;
  clearSelection: () => void;
  // 表单
  openCreate: () => void;
  openEdit: (id: string) => void;
  /** 由 useEffect 监听详情加载完成后调用,避免重复 effect 打开表单 */
  openFormWhenReady: () => void;
  closeForm: () => void;
  // 详情
  openView: (id: string) => void;
  closeDetail: () => void;
  // 删除
  requestDelete: (row: { id: string; name: string }) => void;
  cancelDelete: () => void;
  requestBatchDelete: () => void;
  cancelBatchDelete: () => void;
  // 导入
  openImport: () => void;
  closeImport: () => void;
}

export const useCommunityStore = create<State & Actions>()((set, get) => ({
  page: 1,
  pageSize: 20,
  sorting: [],
  rowSelection: {},
  formOpen: false,
  editingId: null,
  detailOpen: false,
  detailId: null,
  deleteRow: null,
  batchDeleteOpen: false,
  importOpen: false,

  setPage: (p) => set({ page: Math.max(1, p) }),
  setPageSize: (n) => set({ pageSize: Math.max(1, n), page: 1 }),
  setSorting: (next) =>
    set({
      sorting: typeof next === "function" ? next(get().sorting) : next,
      page: 1,
    }),
  setRowSelection: (next) =>
    set({
      rowSelection: typeof next === "function" ? next(get().rowSelection) : next,
    }),
  clearSelection: () => set({ rowSelection: {} }),

  openCreate: () => set({ editingId: null, formOpen: true }),
  openEdit: (id) => set({ editingId: id }),
  openFormWhenReady: () => {
    const { editingId, formOpen } = get();
    if (editingId && !formOpen) set({ formOpen: true });
  },
  closeForm: () => set({ formOpen: false, editingId: null }),

  openView: (id) => set({ detailId: id, detailOpen: true }),
  closeDetail: () => set({ detailOpen: false }),

  requestDelete: (row) => set({ deleteRow: row }),
  cancelDelete: () => set({ deleteRow: null }),
  requestBatchDelete: () => set({ batchDeleteOpen: true }),
  cancelBatchDelete: () => set({ batchDeleteOpen: false }),

  openImport: () => set({ importOpen: true }),
  closeImport: () => set({ importOpen: false }),
}));

/* —— 拆分 selectors(避免 27 字段逐个订阅) —— */

type UiSlice = Pick<
  State,
  | "page"
  | "pageSize"
  | "sorting"
  | "rowSelection"
  | "formOpen"
  | "editingId"
  | "detailOpen"
  | "detailId"
  | "deleteRow"
  | "batchDeleteOpen"
  | "importOpen"
>;

export function useCommunityState(): UiSlice {
  return useCommunityStore(
    useShallow((s) => ({
      page: s.page,
      pageSize: s.pageSize,
      sorting: s.sorting,
      rowSelection: s.rowSelection,
      formOpen: s.formOpen,
      editingId: s.editingId,
      detailOpen: s.detailOpen,
      detailId: s.detailId,
      deleteRow: s.deleteRow,
      batchDeleteOpen: s.batchDeleteOpen,
      importOpen: s.importOpen,
    })),
  );
}

type ActionsSlice = Pick<
  Actions,
  | "setPage"
  | "setPageSize"
  | "setSorting"
  | "setRowSelection"
  | "clearSelection"
  | "openCreate"
  | "openEdit"
  | "openFormWhenReady"
  | "closeForm"
  | "openView"
  | "closeDetail"
  | "requestDelete"
  | "cancelDelete"
  | "requestBatchDelete"
  | "cancelBatchDelete"
  | "openImport"
  | "closeImport"
>;

export function useCommunityActions(): ActionsSlice {
  return useCommunityStore(
    useShallow((s) => ({
      setPage: s.setPage,
      setPageSize: s.setPageSize,
      setSorting: s.setSorting,
      setRowSelection: s.setRowSelection,
      clearSelection: s.clearSelection,
      openCreate: s.openCreate,
      openEdit: s.openEdit,
      openFormWhenReady: s.openFormWhenReady,
      closeForm: s.closeForm,
      openView: s.openView,
      closeDetail: s.closeDetail,
      requestDelete: s.requestDelete,
      cancelDelete: s.cancelDelete,
      requestBatchDelete: s.requestBatchDelete,
      cancelBatchDelete: s.cancelBatchDelete,
      openImport: s.openImport,
      closeImport: s.closeImport,
    })),
  );
}