"use client";

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

export type RoadRow = {
  id: string;
  road: string;
  status: number;
  createdAt: Date | null;
};

function fmtDate(d: Date | string | null): string {
  if (d === null || d === undefined) return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function RoadTable({
  rows,
  isLoading,
  selectedIds,
  onToggleAll,
  onToggleOne,
  allSelected,
  onView,
  onEdit,
  onDelete,
}: {
  rows: RoadRow[];
  isLoading: boolean;
  selectedIds: Set<string>;
  onToggleAll: (next: boolean) => void;
  onToggleOne: (id: string, next: boolean) => void;
  allSelected: boolean;
  onView: (row: RoadRow) => void;
  onEdit: (row: RoadRow) => void;
  onDelete: (row: RoadRow) => void;
}) {
  const empty = !isLoading && rows.length === 0;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <Checkbox
              checked={allSelected}
              onCheckedChange={(v) => onToggleAll(Boolean(v))}
              aria-label="全选"
            />
          </TableHead>
          <TableHead>道路名</TableHead>
          <TableHead className="w-24">状态</TableHead>
          <TableHead className="w-32">创建时间</TableHead>
          <TableHead className="w-44 text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <TableSkeleton rows={4} cols={5} />
        ) : empty ? (
          <TableRow>
            <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
              暂无道路
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => {
            const checked = selectedIds.has(row.id);
            return (
              <TableRow
                key={row.id}
                data-state={checked ? "selected" : undefined}
              >
                <TableCell>
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => onToggleOne(row.id, Boolean(v))}
                    aria-label={`选择 ${row.road}`}
                  />
                </TableCell>
                <TableCell className="font-medium">{row.road}</TableCell>
                <TableCell>
                  <Badge
                    className={cn(
                      "border-transparent",
                      row.status === 1
                        ? "bg-success-soft text-success-fg"
                        : "bg-danger-soft text-danger-fg",
                    )}
                  >
                    {row.status === 1 ? "启用" : "禁用"}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {fmtDate(row.createdAt)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onView(row)}
                      className="h-7 px-2 text-[12.5px] font-normal text-muted-foreground hover:text-foreground"
                    >
                      查看
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(row)}
                      className="h-7 px-2 text-[12.5px] font-normal text-muted-foreground hover:text-foreground"
                    >
                      编辑
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(row)}
                      className="h-7 px-2 text-[12.5px] font-normal text-danger hover:bg-danger-soft hover:text-danger"
                    >
                      删除
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}