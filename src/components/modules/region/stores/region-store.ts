/**
 * 行政区划页 UI 状态 store —— 模块私有。
 *
 * 拆分:
 *   - 树数据:来自 api.region.list(React Query 全量树,无分页)
 *   - UI 态(选中/展开/弹窗):本 store,纯展示状态
 *
 * 用法:
 *   const state = useRegionState();        // 展示字段
 *   const actions = useRegionActions();    // 操作
 */

"use client";

import { create } from "zustand";
import { useShallow } from "zustand/shallow";

interface State {
  /** 当前选中节点 id(null = 未选中) */
  selectedId: string | null;
  /** 展开的节点 code 集合(树按 code 展开) */
  expandedCodes: Set<string>;
  /** 新建弹窗打开 + 预设父级 code(null = 顶级) */
  createOpen: boolean;
  createParentCode: string | null;
  /** 待删除节点(整棵子树确认) */
  deleteRow: { id: string; name: string; subtreeCount: number } | null;
  /** 导入弹窗 */
  importOpen: boolean;
  /** 新建成功后等待选中的 code(树刷新后自动定位) */
  pendingSelectCode: string | null;
}

interface Actions {
  selectNode: (id: string | null) => void;
  toggleExpand: (code: string) => void;
  expandAll: (codes: string[]) => void;
  collapseAll: () => void;
  /** 在现有展开集基础上追加(用于定位新节点展开祖先链) */
  ensureExpanded: (codes: string[]) => void;
  openCreate: (parentCode: string | null) => void;
  closeCreate: () => void;
  requestDelete: (row: { id: string; name: string; subtreeCount: number }) => void;
  cancelDelete: () => void;
  openImport: () => void;
  closeImport: () => void;
  setPendingSelect: (code: string | null) => void;
}

export const useRegionStore = create<State & Actions>()((set, get) => ({
  selectedId: null,
  expandedCodes: new Set(),
  createOpen: false,
  createParentCode: null,
  deleteRow: null,
  importOpen: false,
  pendingSelectCode: null,

  selectNode: (id) => set({ selectedId: id }),
  toggleExpand: (code) => {
    const next = new Set(get().expandedCodes);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    set({ expandedCodes: next });
  },
  expandAll: (codes) => set({ expandedCodes: new Set(codes) }),
  collapseAll: () => set({ expandedCodes: new Set() }),
  ensureExpanded: (codes) =>
    set((s) => {
      const next = new Set(s.expandedCodes);
      for (const c of codes) next.add(c);
      return { expandedCodes: next };
    }),

  openCreate: (parentCode) =>
    set({ createOpen: true, createParentCode: parentCode }),
  // 注意:不清 pendingSelectCode —— 新建已提交的话,由定位 effect 消费后再清
  closeCreate: () => set({ createOpen: false, createParentCode: null }),

  requestDelete: (row) => set({ deleteRow: row }),
  cancelDelete: () => set({ deleteRow: null }),

  openImport: () => set({ importOpen: true }),
  closeImport: () => set({ importOpen: false }),

  setPendingSelect: (code) => set({ pendingSelectCode: code }),
}));

/* —— 拆分 selectors(避免整个 store 大对象订阅) —— */

type UiSlice = Pick<
  State,
  | "selectedId"
  | "expandedCodes"
  | "createOpen"
  | "createParentCode"
  | "deleteRow"
  | "importOpen"
  | "pendingSelectCode"
>;

export function useRegionState(): UiSlice {
  return useRegionStore(
    useShallow((s) => ({
      selectedId: s.selectedId,
      expandedCodes: s.expandedCodes,
      createOpen: s.createOpen,
      createParentCode: s.createParentCode,
      deleteRow: s.deleteRow,
      importOpen: s.importOpen,
      pendingSelectCode: s.pendingSelectCode,
    })),
  );
}

type ActionsSlice = Pick<
  Actions,
  | "selectNode"
  | "toggleExpand"
  | "expandAll"
  | "collapseAll"
  | "ensureExpanded"
  | "openCreate"
  | "closeCreate"
  | "requestDelete"
  | "cancelDelete"
  | "openImport"
  | "closeImport"
  | "setPendingSelect"
>;

export function useRegionActions(): ActionsSlice {
  return useRegionStore(
    useShallow((s) => ({
      selectNode: s.selectNode,
      toggleExpand: s.toggleExpand,
      expandAll: s.expandAll,
      collapseAll: s.collapseAll,
      ensureExpanded: s.ensureExpanded,
      openCreate: s.openCreate,
      closeCreate: s.closeCreate,
      requestDelete: s.requestDelete,
      cancelDelete: s.cancelDelete,
      openImport: s.openImport,
      closeImport: s.closeImport,
      setPendingSelect: s.setPendingSelect,
    })),
  );
}