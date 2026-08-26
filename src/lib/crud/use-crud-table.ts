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

import { useMemo } from "react";
import type {
  RowSelectionState,
  SortingState,
} from "@tanstack/react-table";
import { useAppTable } from "@/lib/table";

type SortingUpdater = (old: SortingState) => SortingState;
type RowSelectionUpdater = (old: RowSelectionState) => RowSelectionState;

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
  } = opts;

  const table = useAppTable({
    data: data as never,
    columns,
    getRowId: getRowId as never,
    state: { sorting, rowSelection },
    onSortingChange,
    onRowSelectionChange,
    manualSorting: true,
    manualPagination: true,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    enableRowSelection: true,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const selectedRows = useMemo(
    () => table.getSelectedRowModel().rows.map((r) => r.original) as T[],
    [table, rowSelection],
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
  };
}