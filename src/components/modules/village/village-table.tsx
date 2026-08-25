"use client";

import { memo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { flexRender } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
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
import {
  STATUS,
  STATUS_BADGE_CLASS,
  STATUS_LABEL,
  orEmpty,
} from "@/lib/constants";
import { fmtShortDate } from "@/lib/date";
import { type RouterOutputs } from "@/trpc/react";

/** 表格行 = list procedure 的 item 类型(单一事实来源) */
export type VillageRow = RouterOutputs["village"]["list"]["items"][number];

const columnHelper = createAppColumnHelper<VillageRow>();

/**
 * 列定义:全选/半选/单项选中全部交给 TanStack 的 rowSelection 管理。
 */
export function createVillageColumns(opts: {
  onView: (row: VillageRow) => void;
  onEdit: (row: VillageRow) => void;
  onDelete: (row: VillageRow) => void;
}) {
  const { onView, onEdit, onDelete } = opts;
  const h = columnHelper;
  return h.columns([
    h.display({
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={
            table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()
          }
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(Boolean(v))}
          aria-label="全选"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(v) => row.toggleSelected(Boolean(v))}
          aria-label={`选择 ${row.original.name}`}
        />
      ),
      meta: { className: "w-10" },
    }),
    columnHelper.accessor("name", {
      header: "名称",
      cell: (info) => <span className="font-medium">{info.getValue()}</span>,
    }),
    columnHelper.accessor("alias", {
      header: "别名",
      cell: (info) => (
        <span className="text-muted-foreground">
          {orEmpty(info.getValue())}
        </span>
      ),
    }),
    columnHelper.accessor("regionName", {
      header: "所属区划",
      cell: (info) => (
        <span className="text-muted-foreground">
          {orEmpty(info.getValue())}
        </span>
      ),
    }),
    columnHelper.accessor("status", {
      header: "状态",
      cell: (info) => {
        const v = info.getValue();
        return (
          <Badge
            className={cn(
              "border-transparent",
              STATUS_BADGE_CLASS[v as keyof typeof STATUS_BADGE_CLASS],
            )}
          >
            {STATUS_LABEL[v as keyof typeof STATUS_LABEL] ?? STATUS_LABEL[STATUS.DISABLED]}
          </Badge>
        );
      },
      meta: { className: "w-24" },
    }),
    columnHelper.accessor("createdAt", {
      header: "创建时间",
      cell: (info) => (
        <span className="text-muted-foreground">
          {fmtShortDate(info.getValue())}
        </span>
      ),
      meta: { className: "w-28" },
    }),
    h.display({
      id: "actions",
      header: () => <div className="text-center">操作</div>,
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex items-center justify-center gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onView(r)}
              className="h-7 px-2 text-xs font-normal text-muted-foreground hover:text-foreground"
            >
              查看
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(r)}
              className="h-7 px-2 text-xs font-normal text-muted-foreground hover:text-foreground"
            >
              编辑
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(r)}
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

/** 排序状态图标 */
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
 * 展示组件:只做 flexRender 渲染,选中/排序等状态由父级 useAppTable 提供。
 */
export const VillageTable = memo(function VillageTable({
  table,
  isLoading,
}: {
  table: ReturnType<typeof useAppTable<VillageRow>>;
  isLoading: boolean;
}) {
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
              {hg.headers.map((header) => {
                const meta = header.column.columnDef.meta;
                const canSort = header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                return (
                  <TableHead key={header.id} className={meta?.className}>
                    {header.isPlaceholder ? null : (
                      <div
                        className={
                          canSort
                            ? "flex cursor-pointer items-center gap-1 select-none"
                            : undefined
                        }
                        onClick={
                          canSort
                            ? header.column.getToggleSortingHandler()
                            : undefined
                        }
                        title={canSort ? "点击排序" : undefined}
                      >
                        <span className="flex-1">
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                        </span>
                        {canSort && <SortIcon sorted={sorted} />}
                      </div>
                    )}
                  </TableHead>
                );
              })}
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
                暂无村
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? "selected" : undefined}
              >
                {row.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta;
                  return (
                    <TableCell key={cell.id} className={meta?.className}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
});