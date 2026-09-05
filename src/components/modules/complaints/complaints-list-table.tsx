"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** 诉件列表单行(与 complains.list 返回字段一致) */
export interface ComplaintsListItem {
  taskId: string;
  reporter: string;
  contactInfo: string;
  address: string;
  stdAddress: string;
  cgType: string;
  discoverTime: string;
  streetName: string;
  gridName: string;
  caseBigType: string;
  caseSmallType: string;
  caseSubType: string;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

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
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="space-y-3">
      <div className="max-h-[420px] overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">发现时间</TableHead>
              <TableHead>举报人</TableHead>
              <TableHead>地址</TableHead>
              <TableHead>标准地址</TableHead>
              <TableHead className="whitespace-nowrap">街镇</TableHead>
              <TableHead>类型</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it) => (
              <TableRow key={it.taskId}>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {it.discoverTime || "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap">{it.reporter || "—"}</TableCell>
                <TableCell className="max-w-[220px] truncate" title={it.address}>
                  {it.address || "—"}
                </TableCell>
                <TableCell
                  className="max-w-[220px] truncate text-emerald-700 dark:text-emerald-500"
                  title={it.stdAddress}
                >
                  {it.stdAddress || "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs">
                  {it.streetName || "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {it.cgType || "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          共 {total} 条 · 第 {page}/{totalPages} 页
        </span>
        <div className="flex items-center gap-2">
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange(Number(v))}
          >
            <SelectTrigger className="h-8 w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s} 条/页
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="size-4" />
            上一页
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            下一页
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
