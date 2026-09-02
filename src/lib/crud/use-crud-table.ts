/**
 * useCrudTable —— 统一封装 tanstack table v9 + 分页 + 选中 + 排序。
 *
 * 用法(配合 store 管分页/排序/选中):
 *   const { table, selectedIds } = useCrudTable({
 *     data: rows,
 *     columns,
 *     pageSize, total,
 *     sorting, rowSelection,
 *     onSortingChange, onRowSelectionChange,
 *     getRowId: (r) => r.id,
 *   });
 *
 * 设计要点:
 *   - 列定义由调用方传入(每模块自定义),本 hook 不感知业务
 *   - 分页/排序/选中状态全部外部传入,store/useState 都能配合
 *   - 返回 table 实例 + 派生的 selectedIds(纯 ID 数组,用于批量删除)
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  ColumnSizingState,
  RowSelectionState,
  SortingState,
} from "@tanstack/react-table";
import { useAppTable } from "@/lib/table";

type SortingUpdater = (old: SortingState) => SortingState;
type RowSelectionUpdater = (old: RowSelectionState) => RowSelectionState;

/** 列宽持久化的 localStorage 键前缀 */
const COLUMN_SIZING_PREFIX = "table-column-widths:";

/** 读取持久化列宽(节流由 useEffect 写入承担;解析失败按空处理) */
function readColumnSizing(storageKey: string): ColumnSizingState {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(COLUMN_SIZING_PREFIX + storageKey);
    const parsed = raw ? (JSON.parse(raw) as ColumnSizingState) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export type UseCrudTableOptions<T> = {
  /** 列表数据(分页/筛选后的当前页) */
  data: T[];
  /** 行稳定 ID(用于 React key、选中 key) */
  getRowId: (row: T) => string;
  /**
   * tanstack 列定义(由各模块 createXxxColumns() 生成)。
   * 类型留 any:createAppColumnHelper 返回的列已经绑定了 lib/table 里的 TableFeatures,
   * 直接喂给 useAppTable 即可。
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: any[];
  /** 每页条数 */
  pageSize: number;
  /** 总记录数(用于分页器展示) */
  total: number;
  /** 排序状态(服务端排序) */
  sorting: SortingState;
  /** 行选中状态(TanStack rowSelection 格式) */
  rowSelection: RowSelectionState;
  /** 排序变化回调 */
  onSortingChange: (next: SortingState | SortingUpdater) => void;
  /** 行选中变化回调 */
  onRowSelectionChange: (next: RowSelectionState | RowSelectionUpdater) => void;
  /**
   * 列宽持久化键(如 "std-address")。
   * 用户拖拽表头调整列宽后写入 localStorage,下次进入保留;
   * 不传则列宽调整只在当前会话内生效。
   */
  storageKey?: string;
};

export function useCrudTable<T>(opts: UseCrudTableOptions<T>) {
  const {
    data,
    getRowId,
    columns,
    pageSize,
    total,
    sorting,
    rowSelection,
    onSortingChange,
    onRowSelectionChange,
    storageKey,
  } = opts;

  // —— 列宽状态(localStorage 持久化;缺省 storageKey 则仅会话内) ——
  // 注意:初始 state 必须为空,且持久化宽度在「挂载后」才读取。
  // 若在 useState 初始化函数里读 localStorage,客户端水合首渲染会带出持久化宽度,
  // 而服务端 window 不存在返回空 → SSR/CSR 不一致(hydration mismatch)。
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (!storageKey) {
      setHydrated(true);
      return;
    }
    setColumnSizing(readColumnSizing(storageKey));
    setHydrated(true);
  }, [storageKey]);
  // 持久化推迟到挂载完成,避免把初始空值写回、覆盖已存宽度
  useEffect(() => {
    if (!storageKey || !hydrated) return;
    try {
      window.localStorage.setItem(
        COLUMN_SIZING_PREFIX + storageKey,
        JSON.stringify(columnSizing),
      );
    } catch {
      // 存储不可用(隐私模式/配额)时静默降级为会话内生效
    }
  }, [storageKey, hydrated, columnSizing]);

  const table = useAppTable({
    data: data as never,
    columns,
    getRowId: getRowId as never,
    state: { sorting, rowSelection, columnSizing },
    onSortingChange,
    onRowSelectionChange,
    onColumnSizingChange: setColumnSizing,
    manualSorting: true,
    manualPagination: true,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    enableRowSelection: true,
  });

  const selectedRows = useMemo(
    () => table.getSelectedRowModel().rows.map((r) => r.original) as T[],
    [table],
  );

  const selectedIds = useMemo(
    () => selectedRows.map((r) => getRowId(r)),
    [selectedRows, getRowId],
  );

  return {
    /**
     * tanstack table 实例,直接喂给 <CrudTable table={table} />。
     * 类型用 any:createTableHook 在 lib/table.ts 内部实例化,useCrudTable 这边
     * 拿到的 AppReactTable 类型与 community-table.tsx 用的 useAppTable 类型是
     * 两个独立的 AppReactTable 实例(同名异构),不 cast 会触发不可赋值错误。
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    table: table as any,
    /** 当前选中的行 ID 数组(用于批量删除的 input.ids) */
    selectedIds,
    /**
     * 列宽状态(TanStack columnSizing)。
     * 直接返回而非经 table.getState() 读取:createTableHook 的表实例是代理,
     * getState 等方法在运行时不可调用。
     */
    columnSizing,
    /** 列宽更新 setter(函数式 updater);供表头拖拽手柄写回 */
    onColumnSizingChange: setColumnSizing,
  };
}
