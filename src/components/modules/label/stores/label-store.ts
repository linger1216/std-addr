/**
 * Label 页 UI 状态 store —— 模块私有(对齐 community-store 模板)。
 */

"use client";

import { create } from "zustand";
import { useShallow } from "zustand/shallow";
import type { RowSelectionState, SortingState } from "@tanstack/react-table";

/** 排序 id 白名单(对应后端 list procedure 的 sort enum) */
export type LabelSortId = "name" | "label" | "status" | "createdAt";

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
  deleteRow: { id: string; name: string } | null;
  batchDeleteOpen: boolean;
  importOpen: boolean;
}

interface Actions {
  setPage: (p: number) => void;
  setPageSize: (n: number) => void;
  setSorting: (next: SortingState | SortingUpdater) => void;
  setRowSelection: (next: RowSelectionState | RowSelectionUpdater) => void;
  clearSelection: () => void;
  openCreate: () => void;
  openEdit: (id: string) => void;
  openFormWhenReady: () => void;
  closeForm: () => void;
  openView: (id: string) => void;
  closeDetail: () => void;
  requestDelete: (row: { id: string; name: string }) => void;
  cancelDelete: () => void;
  requestBatchDelete: () => void;
  cancelBatchDelete: () => void;
  openImport: () => void;
  closeImport: () => void;
}

export const useLabelStore = create<State & Actions>()((set, get) => ({
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

/* —— 拆分 selectors —— */

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

export function useLabelState(): UiSlice {
  return useLabelStore(
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

export function useLabelActions(): ActionsSlice {
  return useLabelStore(
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