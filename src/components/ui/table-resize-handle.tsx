"use client";

/**
 * 表头列宽拖拽手柄(自绘 pointer 实现)。
 *
 * 不用 TanStack 原生 getResizeHandler:createTableHook 的表/列实例是
 * 白名单代理,column.getResizeHandler 在运行时不存在(TypeError)。
 * 这里直接基于 th 当前渲染宽度 + pointer 位移计算新宽度,
 * 通过 onColumnSizingChange 写回(useCrudTable 的 columnSizing 状态)。
 *
 * 交互:
 *  - 拖拽右边缘调整列宽
 *  - 双击手柄重置该列(删除 columnSizing 条目 → 回到自动布局)
 */

import type React from "react";

export function TableResizeHandle({
  columnId,
  onChange,
}: {
  columnId: string;
  /** 更新列宽(函数式 updater,与 useState setter 兼容) */
  onChange: (
    updater: (prev: Record<string, number>) => Record<string, number>,
  ) => void;
}) {
  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    // 以表头单元格(th)当前渲染宽度为基准
    const th = e.currentTarget.parentElement;
    const startWidth = th?.getBoundingClientRect().width ?? 120;
    const startX = e.clientX;

    const move = (ev: PointerEvent) => {
      const nextWidth = Math.max(40, Math.round(startWidth + ev.clientX - startX));
      onChange((prev) => ({ ...prev, [columnId]: nextWidth }));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  function handleDoubleClick() {
    // 重置该列:删除条目后 th/cell 不再有固定宽度,回落到列定义/自动布局
    onChange((prev) => {
      if (!(columnId in prev)) return prev;
      const next = { ...prev };
      delete next[columnId];
      return next;
    });
  }

  return (
    <div
      role="separator"
      aria-label="拖拽调整列宽"
      title="拖拽调整列宽;双击重置"
      onPointerDown={handlePointerDown}
      onDoubleClick={handleDoubleClick}
      className="absolute top-0 right-0 z-10 h-full w-1.5 cursor-col-resize touch-none rounded-r select-none transition-colors hover:bg-primary/50"
    />
  );
}