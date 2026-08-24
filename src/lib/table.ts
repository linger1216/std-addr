"use client";

import { createTableHook, tableFeatures } from "@tanstack/react-table";
import {
  cellSelectionFeature,
  columnFacetingFeature,
  columnFilteringFeature,
  columnGroupingFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  globalFilteringFeature,
  rowExpandingFeature,
  rowPaginationFeature,
  rowPinningFeature,
  rowSelectionFeature,
  rowSortingFeature,
  createFilteredRowModel,
  createSortedRowModel,
  createPaginatedRowModel,
  createExpandedRowModel,
  createGroupedRowModel,
} from "@tanstack/react-table";

/**
 * 统一 TanStack Table v9 app hook。
 * ponytail: 全项目只造这一个 hook,所有 CRUD 表格用它,
 * 列/选中/分页/排序全交给 TanStack,不重复手写。
 *
 * createTableHook 返回 { useAppTable, createAppColumnHelper, appFeatures, ... }。
 */
export const { useAppTable, createAppColumnHelper } = createTableHook({
  features: tableFeatures({
    cellSelectionFeature,
    columnFacetingFeature,
    columnFilteringFeature,
    columnGroupingFeature,
    columnOrderingFeature,
    columnPinningFeature,
    columnResizingFeature,
    columnSizingFeature,
    columnVisibilityFeature,
    globalFilteringFeature,
    rowExpandingFeature,
    rowPaginationFeature,
    rowPinningFeature,
    rowSelectionFeature,
    rowSortingFeature,
    createFilteredRowModel,
    createSortedRowModel,
    createPaginatedRowModel,
    createExpandedRowModel,
    createGroupedRowModel,
  }),
});