"use client";

import { Eye, Pencil, Trash2 } from "lucide-react";

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

export function CommunityTable({
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
  rows: CommunityRow[];
  isLoading: boolean;
  selectedIds: Set<string>;
  onToggleAll: (next: boolean) => void;
  onToggleOne: (id: string, next: boolean) => void;
  allSelected: boolean;
  onView: (row: CommunityRow) => void;
  onEdit: (row: CommunityRow) => void;
  onDelete: (row: CommunityRow) => void;
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
          <TableHead>名称</TableHead>
          <TableHead>别名</TableHead>
          <TableHead>所属区划</TableHead>
          <TableHead className="w-24">状态</TableHead>
          <TableHead className="w-32">创建时间</TableHead>
          <TableHead className="w-44 text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <TableSkeleton rows={4} cols={7} />
        ) : empty ? (
          <TableRow>
            <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
              暂无小区
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
                    aria-label={`选择 ${row.name}`}
                  />
                </TableCell>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {row.alias ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {row.regionName ?? "—"}
                </TableCell>
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
                      size="icon-sm"
                      onClick={() => onView(row)}
                      aria-label="查看"
                    >
                      <Eye className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onEdit(row)}
                      aria-label="编辑"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onDelete(row)}
                      aria-label="删除"
                      className="text-danger hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 className="size-3.5" />
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
