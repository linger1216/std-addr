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
import { formatDateTime, formatJson } from "@/lib/format";
import { STATUS_BADGE_CLASS, STATUS_LABEL, type StatusValue } from "@/lib/constants";
import type { CommunityDetail } from "./community-form";

/** 详情字段 = getById 输出(单一事实来源:community-form.tsx,已含 region) */
type Detail = CommunityDetail;

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

/** JSON 字段的统一渲染容器 */
function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-32 overflow-auto rounded-lg bg-secondary/60 p-2 font-mono text-[11.5px] leading-relaxed">
      {formatJson(value)}
    </pre>
  );
}

/** 状态 badge:复用 STATUS_LABEL/STATUS_BADGE_CLASS(lib/constants) */
function StatusBadge({ status }: { status: number }) {
  const v: StatusValue = status === 1 ? 1 : 0;
  return (
    <Badge className={`border-transparent ${STATUS_BADGE_CLASS[v]}`}>
      {STATUS_LABEL[v]}
    </Badge>
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