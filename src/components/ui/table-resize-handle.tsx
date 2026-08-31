"use client";

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */

/**
 * 表头列宽拖拽手柄(TanStack columnResizing)。
 *
 * 用法(各模块 table.tsx 的 HeaderCell):
 *   <TableHead className={cn("relative text-center", meta?.className)}>
 *     ...
 *     <TableResizeHandle column={header.column} />
 *   </TableHead>
 *
 * 交互:
 *  - 拖拽右边缘调整列宽(columnSizing 由 useCrudTable 管理并持久化 localStorage)
 *  - 双击手柄重置该列宽度
 */
export function TableResizeHandle({ column }: { column: any }) {
  return (
    <div
      role="separator"
      aria-label="拖拽调整列宽"
      title="拖拽调整列宽;双击重置"
      onDoubleClick={() => column.resetSize()}
      onMouseDown={column.getResizeHandler()}
      onTouchStart={column.getResizeHandler()}
      className="absolute top-0 right-0 z-10 h-full w-1.5 cursor-col-resize touch-none rounded-r select-none transition-colors hover:bg-primary/50"
    />
  );
}