"use client";

import { flexRender, type ColumnDef } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { TableSkeleton } from "@/components/ui/skeleton-blocks";
import { useAppTable, createAppColumnHelper } from "@/lib/table";

export type CommunityRow = {
  id: string;
  name: string;
  alias: string | null;
  regionId: string | null;
  regionName: string | null;
  status: number;
  createdAt: Date;
};

function fmtDate(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

const columnHelper = createAppColumnHelper<CommunityRow>();

/**
 * 列定义:全选/半选/单项选中全部交给 TanStack 的 rowSelection 管理,
 * 不用手写 Set 与 toggleAll/toggleOne 回调。
 */
export function createCommunityColumns(opts: {
  onView: (row: CommunityRow) => void;
  onEdit: (row: CommunityRow) => void;
  onDelete: (row: CommunityRow) => void;
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
      cell: (info) => (
        <span className="font-medium">{info.getValue()}</span>
      ),
    }),
    columnHelper.accessor("alias", {
      header: "别名",
      cell: (info) => (
        <span className="text-muted-foreground">
          {(info.getValue() as string | null) ?? "—"}
        </span>
      ),
    }),
    columnHelper.accessor("regionName", {
      header: "所属区划",
      cell: (info) => (
        <span className="text-muted-foreground">
          {(info.getValue() as string | null) ?? "—"}
        </span>
      ),
    }),
    columnHelper.accessor("status", {
      header: "状态",
      cell: (info) => {
        const v = info.getValue() as number;
        return (
          <Badge
            className={cn(
              "border-transparent",
              v === 1
                ? "bg-success-soft text-success-fg"
                : "bg-danger-soft text-danger-fg",
            )}
          >
            {v === 1 ? "启用" : "禁用"}
          </Badge>
        );
      },
      meta: { className: "w-24" },
    }),
    columnHelper.accessor("createdAt", {
      header: "创建时间",
      cell: (info) => (
        <span className="text-muted-foreground">
          {fmtDate(info.getValue() as Date)}
        </span>
      ),
      meta: { className: "w-32" },
    }),
    h.display({
      id: "actions",
      header: () => <div className="text-right">操作</div>,
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onView(r)}
              className="h-7 px-2 text-[12.5px] font-normal text-muted-foreground hover:text-foreground"
            >
              查看
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(r)}
              className="h-7 px-2 text-[12.5px] font-normal text-muted-foreground hover:text-foreground"
            >
              编辑
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(r)}
              className="h-7 px-2 text-[12.5px] font-normal text-danger hover:bg-danger-soft hover:text-danger"
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

/**
 * 展示组件:只做 flexRender 渲染,选中/分页/排序等状态全由
 * 父级 useAppTable 实例提供,不自己造轮子。
 */
export function CommunityTable({
  table,
  isLoading,
}: {
  table: ReturnType<typeof useAppTable<CommunityRow>>;
  isLoading: boolean;
}) {
  const colSpan = table.getHeaderGroups()[0]?.headers.length ?? 7;
  const empty = !isLoading && table.getRowModel().rows.length === 0;

  return (
    <Table containerClassName="h-full overflow-y-auto">
      <TableHeader>
        {table.getHeaderGroups().map((hg) => (
          <TableRow key={hg.id}>
            {hg.headers.map((header) => {
              const meta = header.column.columnDef.meta as
                | { className?: string }
                | undefined;
              return (
                <TableHead key={header.id} className={meta?.className}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <TableSkeleton rows={4} cols={colSpan} />
        ) : empty ? (
          <TableRow>
            <TableCell
              colSpan={colSpan}
              className="py-10 text-center text-muted-foreground"
            >
              暂无小区
            </TableCell>
          </TableRow>
        ) : (
          table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              data-state={row.getIsSelected() ? "selected" : undefined}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}