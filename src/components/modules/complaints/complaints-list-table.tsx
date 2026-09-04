"use client";

import type { RouterOutputs } from "@/trpc/react";
import { PaginationControl } from "@/components/modules/shared/pagination-control";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ComplaintsListItem =
  RouterOutputs["complains"]["list"]["items"][number];

export function ComplaintsListTable({
  items,
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  items: ComplaintsListItem[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (next: number) => void;
  onPageSizeChange: (next: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="max-h-[460px] overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">任务ID</TableHead>
              <TableHead className="w-[120px]">诉求人</TableHead>
              <TableHead className="w-[120px]">联系方式</TableHead>
              <TableHead>地址</TableHead>
              <TableHead>标准地址</TableHead>
              <TableHead className="w-[110px]">类型</TableHead>
              <TableHead className="w-[110px]">发现时间</TableHead>
              <TableHead className="w-[100px]">街镇</TableHead>
              <TableHead className="w-[120px]">网格名称</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-6 text-center text-sm text-muted-foreground">
                  无诉件记录
                </TableCell>
              </TableRow>
            ) : (
              items.map((it) => (
                <TableRow key={it.taskId}>
                  <TableCell className="max-w-[140px] truncate font-mono text-xs">
                    {it.taskId}
                  </TableCell>
                  <TableCell className="truncate">{it.reporter || "—"}</TableCell>
                  <TableCell className="truncate text-xs text-muted-foreground">
                    {it.contactInfo || "—"}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate">{it.address || "—"}</TableCell>
                  <TableCell className="max-w-[220px] truncate text-xs text-emerald-700 dark:text-emerald-500">
                    {it.stdAddress || "—"}
                  </TableCell>
                  <TableCell className="truncate">{it.cgType || "—"}</TableCell>
                  <TableCell className="truncate text-xs">{it.discoverTime || "—"}</TableCell>
                  <TableCell className="truncate">{it.streetName || "—"}</TableCell>
                  <TableCell className="truncate">{it.gridName || "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PaginationControl
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </div>
  );
}
