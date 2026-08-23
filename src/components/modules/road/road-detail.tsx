"use client";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

type Detail = {
  id: string;
  road: string;
  status: number;
  createdAt: Date | null;
  updatedAt: Date | null;
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[100px_1fr] items-start gap-3 py-2">
      <Label className="text-[12px] font-normal text-muted-foreground">
        {label}
      </Label>
      <div className="min-w-0 break-words text-[13px] text-foreground">
        {children}
      </div>
    </div>
  );
}

function fmtDate(d: Date | string | null): string {
  if (d === null || d === undefined) return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function RoadDetailDialog({
  open,
  onOpenChange,
  detail,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  detail: Detail | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{detail?.road ?? "道路详情"}</DialogTitle>
          <DialogDescription>只读视图 · 所有字段</DialogDescription>
        </DialogHeader>

        {detail ? (
          <div className="divide-y divide-border/60">
            <Row label="道路名">{detail.road}</Row>
            <Row label="状态">
              {detail.status === 1 ? (
                <Badge className="border-transparent bg-success-soft text-success-fg">
                  启用
                </Badge>
              ) : (
                <Badge className="border-transparent bg-danger-soft text-danger-fg">
                  禁用
                </Badge>
              )}
            </Row>
            <Row label="创建时间">{fmtDate(detail.createdAt)}</Row>
            <Row label="更新时间">{fmtDate(detail.updatedAt)}</Row>
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">未选择道路。</p>
        )}
      </DialogContent>
    </Dialog>
  );
}