"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { orEmpty } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import type { LabelDetail } from "./label-form";

/** 详情字段 = getById 输出(单一事实来源:label-form.tsx) */
type Detail = LabelDetail;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[100px_1fr] items-start gap-3 py-2">
      <Label className="text-[12px] font-normal text-muted-foreground">
        {label}
      </Label>
      <div className="min-w-0 wrap-break-words text-[13px] text-foreground">
        {children}
      </div>
    </div>
  );
}

export function LabelDetailDialog({
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{detail?.name ?? "要素详情"}</DialogTitle>
          <DialogDescription>只读视图 · 所有字段</DialogDescription>
        </DialogHeader>

        {detail ? (
          <div className="divide-y divide-border/60">
            <Row label="名称">{detail.name}</Row>
            <Row label="标签">{orEmpty(detail.label)}</Row>
            <Row label="状态">
              <StatusBadge status={detail.status} />
            </Row>
            {/* 创建/更新时间约定放字段最后,见 CLAUDE.md §7 */}
            <Row label="创建时间">{formatDateTime(detail.createdAt)}</Row>
            <Row label="更新时间">{formatDateTime(detail.updatedAt)}</Row>
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">未选择要素。</p>
        )}
      </DialogContent>
    </Dialog>
  );
}