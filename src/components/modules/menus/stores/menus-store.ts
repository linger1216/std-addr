/**
 * 菜单页 UI 状态 store —— 模块私有。
 *
 * 布局:左侧树(master)+ 右侧内联表单(detail)。
 * 本 store 只保留 UI 态:
 *  - selectedId:左侧树当前选中节点(右侧表单编辑对象)
 *  - collapsedIds:树中折叠的父菜单 id 集合
 *  - createActive / createParentId:新建模式(顶部「新建菜单」= 顶级,
 *    树节点「+」= 该节点下的子菜单)
 *  - deleteRow:删除确认弹窗的单条记录
 */

"use client";

import { create } from "zustand";
import { useShallow } from "zustand/shallow";

interface State {
  selectedId: string | null;
  collapsedIds: string[];
  /** 是否处于"新建菜单"模式(右侧表单切换为创建表单) */
  createActive: boolean;
  /** 新建菜单的预设父级;null = 顶级菜单(仅 createActive 时有意义) */
  createParentId: string | null;
  deleteRow: { id: string; name: string } | null;
}

interface Actions {
  select: (id: string | null) => void;
  toggleCollapsed: (id: string) => void;
  /** 显式设置折叠态(新建子菜单后展开父级用) */
  setCollapsed: (id: string, collapsed: boolean) => void;
  startCreate: (parentId: string | null) => void;
  cancelCreate: () => void;
  requestDelete: (row: { id: string; name: string }) => void;
  cancelDelete: () => void;
}

export const useMenusStore = create<State & Actions>()((set, get) => ({
  selectedId: null,
  collapsedIds: [],
  createActive: false,
  createParentId: null,
  deleteRow: null,

  select: (id) => set({ selectedId: id, createActive: false }),
  toggleCollapsed: (id) =>
    set({
      collapsedIds: get().collapsedIds.includes(id)
        ? get().collapsedIds.filter((x) => x !== id)
        : [...get().collapsedIds, id],
    }),
  setCollapsed: (id, collapsed) =>
    set({
      collapsedIds: collapsed
        ? get().collapsedIds.includes(id)
          ? get().collapsedIds
          : [...get().collapsedIds, id]
        : get().collapsedIds.filter((x) => x !== id),
    }),
  startCreate: (parentId) =>
    set({ createActive: true, createParentId: parentId }),
  cancelCreate: () => set({ createActive: false, createParentId: null }),

  requestDelete: (row) => set({ deleteRow: row }),
  cancelDelete: () => set({ deleteRow: null }),
}));

/* —— 拆分 selectors —— */

type StateSlice = Pick<
  State,
  "selectedId" | "collapsedIds" | "createActive" | "createParentId" | "deleteRow"
>;

export function useMenusState(): StateSlice {
  return useMenusStore(
    useShallow((s) => ({
      selectedId: s.selectedId,
      collapsedIds: s.collapsedIds,
      createActive: s.createActive,
      createParentId: s.createParentId,
      deleteRow: s.deleteRow,
    })),
  );
}

type ActionsSlice = Pick<
  Actions,
  | "select"
  | "toggleCollapsed"
  | "setCollapsed"
  | "startCreate"
  | "cancelCreate"
  | "requestDelete"
  | "cancelDelete"
>;

export function useMenusActions(): ActionsSlice {
  return useMenusStore(
    useShallow((s) => ({
      select: s.select,
      toggleCollapsed: s.toggleCollapsed,
      setCollapsed: s.setCollapsed,
      startCreate: s.startCreate,
      cancelCreate: s.cancelCreate,
      requestDelete: s.requestDelete,
      cancelDelete: s.cancelDelete,
    })),
  );
}