/**
 * 标准地址库页 UI 状态 store —— 模块私有。
 *
 * 拆分:
 *   - 查询参数(搜索/状态):useStdAddressQueryParams(createQueryParamsStore,与其它模块一致)
 *   - UI 态(分页/排序/选中/dialog open):本 store,纯展示状态
 *
 * 用法:
 *   const { page, rowSelection, openForm } = useStdAddressState();
 *   const actions = useStdAddressActions();
 */

"use client";

import { create } from "zustand";
import { useShallow } from "zustand/shallow";
import type { RowSelectionState, SortingState } from "@tanstack/react-table";
import type { StdFields } from "@/lib/standardize/build";
import type { TraceStep } from "@/components/modules/std-address/std-address-standardize-trace";

/** 排序 id 白名单(对应后端 list procedure 的 sort enum) */
export type StdAddressSortId =
  | "rawAddress"
  | "stdAddress"
  | "stdScore"
  | "status"
  | "createdAt";

/**
 * 新建「解析→准入」流程的草稿预览。
 * 由 StdAddressParseDialog 解析成功后写入,StdAddressDetailDialog 以草稿态渲染,
 * 用户点「准入」才真正 create 落库。
 */
export interface StdAddressPreviewDraft {
  rawAddress: string;
  stdAddress: string | null;
  stdScore: number | string | null;
  fields: StdFields;
  status?: 0 | 1;
  /** 解析时已带 debug,直接随草稿传入,详情弹窗无需再次运行流程 */
  trace?: TraceStep[];
}

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
  /** 新建「解析→准入」:解析输入弹窗是否打开 */
  parseOpen: boolean;
  /** 新建「解析→准入」:解析成功后的草稿预览(未落库) */
  previewDraft: StdAddressPreviewDraft | null;
  /** 待删除单条(只存 id/name,不持有整条数据) */
  deleteRow: { id: string; name: string } | null;
  batchDeleteOpen: boolean;
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
  // 表单(仅编辑;新建走解析→准入流程)
  openEdit: (id: string) => void;
  /** 由 useEffect 监听详情加载完成后调用,避免重复 effect 打开表单 */
  openFormWhenReady: () => void;
  closeForm: () => void;
  // 详情 / 预览
  openView: (id: string) => void;
  closeDetail: () => void;
  // 新建「解析→准入」
  openParse: () => void;
  closeParse: () => void;
  openPreview: (draft: StdAddressPreviewDraft) => void;
  closePreview: () => void;
  // 删除
  requestDelete: (row: { id: string; name: string }) => void;
  cancelDelete: () => void;
  requestBatchDelete: () => void;
  cancelBatchDelete: () => void;
}

export const useStdAddressStore = create<State & Actions>()((set, get) => ({
  page: 1,
  pageSize: 20,
  sorting: [],
  rowSelection: {},
  formOpen: false,
  editingId: null,
  detailOpen: false,
  detailId: null,
  parseOpen: false,
  previewDraft: null,
  deleteRow: null,
  batchDeleteOpen: false,

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

  openEdit: (id) => set({ editingId: id }),
  openFormWhenReady: () => {
    const { editingId, formOpen } = get();
    if (editingId && !formOpen) set({ formOpen: true });
  },
  closeForm: () => set({ formOpen: false, editingId: null }),

  openView: (id) => set({ detailId: id, detailOpen: true }),
  closeDetail: () => set({ detailOpen: false, detailId: null, previewDraft: null }),

  openParse: () => set({ parseOpen: true }),
  closeParse: () => set({ parseOpen: false }),
  openPreview: (draft) =>
    set({ previewDraft: draft, detailOpen: true, detailId: null, parseOpen: false }),
  closePreview: () => set({ detailOpen: false, previewDraft: null, detailId: null }),

  requestDelete: (row) => set({ deleteRow: row }),
  cancelDelete: () => set({ deleteRow: null }),
  requestBatchDelete: () => set({ batchDeleteOpen: true }),
  cancelBatchDelete: () => set({ batchDeleteOpen: false }),
}));

/* —— 拆分 selectors(避免逐字段订阅导致渲染抖动) —— */

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
  | "parseOpen"
  | "previewDraft"
  | "deleteRow"
  | "batchDeleteOpen"
>;

export function useStdAddressState(): UiSlice {
  return useStdAddressStore(
    useShallow((s) => ({
      page: s.page,
      pageSize: s.pageSize,
      sorting: s.sorting,
      rowSelection: s.rowSelection,
      formOpen: s.formOpen,
      editingId: s.editingId,
      detailOpen: s.detailOpen,
      detailId: s.detailId,
      parseOpen: s.parseOpen,
      previewDraft: s.previewDraft,
      deleteRow: s.deleteRow,
      batchDeleteOpen: s.batchDeleteOpen,
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
  | "openEdit"
  | "openFormWhenReady"
  | "closeForm"
  | "openView"
  | "closeDetail"
  | "openParse"
  | "closeParse"
  | "openPreview"
  | "closePreview"
  | "requestDelete"
  | "cancelDelete"
  | "requestBatchDelete"
  | "cancelBatchDelete"
>;

export function useStdAddressActions(): ActionsSlice {
  return useStdAddressStore(
    useShallow((s) => ({
      setPage: s.setPage,
      setPageSize: s.setPageSize,
      setSorting: s.setSorting,
      setRowSelection: s.setRowSelection,
      clearSelection: s.clearSelection,
      openEdit: s.openEdit,
      openFormWhenReady: s.openFormWhenReady,
      closeForm: s.closeForm,
      openView: s.openView,
      closeDetail: s.closeDetail,
      openParse: s.openParse,
      closeParse: s.closeParse,
      openPreview: s.openPreview,
      closePreview: s.closePreview,
      requestDelete: s.requestDelete,
      cancelDelete: s.cancelDelete,
      requestBatchDelete: s.requestBatchDelete,
      cancelBatchDelete: s.cancelBatchDelete,
    })),
  );
}