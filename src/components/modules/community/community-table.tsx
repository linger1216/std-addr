"use client";

import { memo, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { flexRender } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { type useAppTable, createAppColumnHelper } from "@/lib/table";
import { orEmpty } from "@/lib/constants";
import { formatShortDate, normalizeAddress } from "@/lib/format";
import type { RouterOutputs } from "@/trpc/react";

/** 表格行 = list procedure 的 item 类型(单一事实来源) */
export type CommunityRow =
  RouterOutputs["community"]["list"]["items"][number];

const columnHelper = createAppColumnHelper<CommunityRow>();

/** 行级回调 —— 通过 column meta 透传给列定义使用 */
type CommunityRowCallbacks = {
  onView?: (row: CommunityRow) => void;
  onEdit?: (row: CommunityRow) => void;
  onDelete?: (row: CommunityRow) => void;
};

/**
 * 列定义:全选/单选交给 TanStack rowSelection 管理,
 * 行级操作按钮通过 column meta.callbacks 拿到回调。
 */
export function createCommunityColumns() {
  return columnHelper.columns([
    columnHelper.display({
      id: "select",
      header: ({ table }) => (
        // flex 居中容器,确保 Checkbox 在 text-center cell 里也能水平居中
        <div className="flex justify-center">
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            indeterminate={
              table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()
            }
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(Boolean(v))}
            aria-label="全选"
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex justify-center">
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(Boolean(v))}
            aria-label={`选择 ${row.original.name}`}
          />
        </div>
      ),
      meta: { className: "w-10" },
    }),
    columnHelper.accessor("name", {
      header: () => <div className="text-center">名称</div>,
      cell: (info) => <span className="items-center font-medium">{info.getValue()}</span>,
    }),
    columnHelper.accessor("alias", {
      header: () => <div className="text-center">别名</div>,
      cell: (info) => (
        <span className="text-muted-foreground">{orEmpty(info.getValue())}</span>
      ),
    }),
    columnHelper.accessor("regionName", {
      header: () => <div className="text-center">所属区划</div>,
      cell: (info) => {
        const val = orEmpty(info.getValue());
        return (
          <div className="flex justify-center">
            <Badge className="p-2.5" variant="outline">{val}</Badge>
          </div>
        );
      },
    }),
    columnHelper.accessor("address", {
      header: () => <div className="text-center">地址</div>,
      cell: (info) => <AddressCell value={info.getValue()} />,
      meta: { className: "min-w-[200px]" },
    }),
    columnHelper.accessor("status", {
      header: () => <div className="text-center">状态</div>,
      cell: (info) => <StatusBadge status={info.getValue()} />,
      meta: { className: "w-24" },
    }),
    columnHelper.accessor("createdAt", {
      header: () => <div className="text-center">创建时间</div>,
      cell: (info) => (
        <span className="text-muted-foreground">
          {formatShortDate(info.getValue())}
        </span>
      ),
      meta: { className: "w-28" },
    }),
    columnHelper.display({
      id: "actions",
      header: () => <div className="text-center">操作</div>,
      cell: ({ row, table }) => {
        const r = row.original;
        // ponytail: 回调走 meta,避免每行透传 closure
        const cb = (table.options.meta as { callbacks?: CommunityRowCallbacks })
          ?.callbacks;
        return (
          <div className="flex items-center justify-center gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => cb?.onView?.(r)}
              className="h-7 px-2 text-xs font-normal text-muted-foreground hover:text-foreground"
            >
              查看
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => cb?.onEdit?.(r)}
              className="h-7 px-2 text-xs font-normal text-muted-foreground hover:text-foreground"
            >
              编辑
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => cb?.onDelete?.(r)}
              className="h-7 px-2 text-xs font-normal text-danger hover:bg-danger-soft hover:text-danger"
            >
              删除
            </Button>
          </div>
        );
      },
      meta: { className: "w-44" },
    }),
  ]);
}

/** 地址列:多行渲染 */
function AddressCell({ value }: { value: unknown }) {
  const lines = normalizeAddress(value);
  if (lines.length === 0) {
    return <span className="text-muted-foreground">-</span>;
  }
  return (
    <div className="text-muted-foreground">
      {lines.map((line, i) => (
        <div key={i} className="flex justify-center">
          <Badge className="p-2.5 mt-1" variant="outline">{line}</Badge>
        </div>
      ))}
    </div>
  );
}

/** 排序状态图标:未排序 → 双向箭头(灰);升/降 → 实心箭头 */
function SortIcon({ sorted }: { sorted: false | "asc" | "desc" }) {
  return (
    <span className="flex shrink-0 items-center">
      <motion.span
        initial={false}
        animate={{ opacity: sorted ? 1 : 0.4 }}
        transition={{ duration: 0.15 }}
      >
        {sorted === "asc" ? (
          <ArrowUp className="size-3.5" />
        ) : sorted === "desc" ? (
          <ArrowDown className="size-3.5" />
        ) : (
          <ChevronsUpDown className="size-3.5" />
        )}
      </motion.span>
    </span>
  );
}

/**
 * 展示组件:接收外部 table 实例 + 行回调。
 * 选中/分页/排序等状态由父级 useCrudTable 统一管,不重复造轮子。
 */
export const CommunityTable = memo(function CommunityTable({
  table,
  isLoading,
  callbacks,
}: {
  table: ReturnType<typeof useAppTable<CommunityRow>>;
  isLoading: boolean;
  callbacks: CommunityRowCallbacks;
}) {
  // 把回调挂到 meta 上,列定义内部通过 table.options.meta 读取。
  // ponytail: 用 ref 持有同一对象,首次渲染把 meta 注入到 table.options,
  // 之后只更新 ref.current.callbacks,避免反复调用 setOptions 触发不必要的重渲染。
  const metaRef = useRef<{ callbacks: CommunityRowCallbacks }>({ callbacks });
  metaRef.current.callbacks = callbacks;
  if (!table.options.meta) {
    table.setOptions((prev) => ({ ...prev, meta: metaRef.current }));
  }

  const headers = table.getHeaderGroups()[0]?.headers;
  const colSpan = headers?.length ?? table.getAllLeafColumns().length;
  const syncing = isLoading;
  const empty = !syncing && table.getRowModel().rows.length === 0;

  return (
    <div className="relative h-full min-h-0">
      <AnimatePresence>
        {syncing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[1px]"
          >
            <Spinner label="加载中…" />
          </motion.div>
        )}
      </AnimatePresence>
      <Table containerClassName="h-full overflow-y-auto">
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((header) => (
                <HeaderCell key={header.id} header={header} />
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {empty ? (
            <TableRow>
              <TableCell
                colSpan={colSpan}
                className="py-10 text-center text-muted-foreground"
              >
                暂无小区
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row, index) => (
              <DataRow key={row.id} row={row} index={index} />
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
});

/** 表头单元格(排序 + 点击) */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
function HeaderCell({ header }: { header: any }) {
  const meta = header.column.columnDef.meta;
  const canSort = header.column.getCanSort();
  const sorted = header.column.getIsSorted();
  return (
    <TableHead key={header.id} className={cn("text-center", meta?.className)}>
      {header.isPlaceholder ? null : (
        <div
          className={
            canSort
              ? "flex cursor-pointer items-center justify-center gap-1 select-none"
              : undefined
          }
          onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
          title={canSort ? "点击排序" : undefined}
        >
          <span>
            {flexRender(header.column.columnDef.header, header.getContext())}
          </span>
          {canSort && <SortIcon sorted={sorted} />}
        </div>
      )}
    </TableHead>
  );
}

/** 数据行:选中状态 + 单元格渲染 + 斑马行(偶数行浅底) */
function DataRow({ row, index }: { row: any; index: number }) {
  return (
    <TableRow
      key={row.id}
      data-state={row.getIsSelected() ? "selected" : undefined}
      // 偶数行加浅底;hover/selected 状态的更深底色会自动覆盖
      className={index % 2 === 1 ? "bg-muted/30" : undefined}
    >
      {row.getVisibleCells().map((cell: any) => {
        const meta = cell.column.columnDef.meta;
        return (
          <TableCell key={cell.id} className={cn("text-center", meta?.className)}>
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        );
      })}
    </TableRow>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
