"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { JsonBlock } from "@/components/ui/json-block";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateTime } from "@/lib/format";
import type { CommunityDetail } from "./community-form";

/** 详情字段 = getById 输出(单一事实来源:community-form.tsx,已含 region) */
type Detail = CommunityDetail;

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

export function CommunityDetailDialog({
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
          <DialogTitle>{detail?.name ?? "小区详情"}</DialogTitle>
          <DialogDescription>只读视图 · 所有字段</DialogDescription>
        </DialogHeader>

        {detail ? (
          <div className="divide-y divide-border/60">
            <Row label="名称">{detail.name}</Row>
            <Row label="别名">{detail.alias ?? "—"}</Row>
            <Row label="所属区划">{detail.region?.name ?? "—"}</Row>
            <Row label="状态">
              <StatusBadge status={detail.status} />
            </Row>
            <Row label="创建时间">{formatDateTime(detail.createdAt)}</Row>
            <Row label="更新时间">{formatDateTime(detail.updatedAt)}</Row>
            <Row label="地址 (JSON)">
              <JsonBlock value={detail.address} />
            </Row>
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">未选择小区。</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
