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
import { orEmpty, PLACEHOLDER_EMPTY } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { STD_ADDRESS_FIELDS } from "./std-address-fields";
import type { StdAddressDetail } from "./std-address-form";

/* 27 个地址要素的中文标签来自共享常量(与表格列一致,单一事实来源) */

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

export function StdAddressDetailDialog({
  open,
  onOpenChange,
  detail,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  detail: StdAddressDetail | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>标准地址详情</DialogTitle>
          <DialogDescription>只读视图 · 标准结果与 27 个地址要素</DialogDescription>
        </DialogHeader>

        {detail ? (
          <div className="divide-y divide-border/60">
            <Row label="原始地址">{detail.rawAddress}</Row>
            <Row label="标准地址">{orEmpty(detail.stdAddress)}</Row>
            <Row label="标准评分">
              <ScoreText value={detail.stdScore} />
            </Row>
            <Row label="状态">
              <StatusBadge status={detail.status} />
            </Row>

            {/* 27 个地址要素:全字段展示(空值显示占位符) */}
            {STD_ADDRESS_FIELDS.map(([key, label]) => {
              const v = detail[key as keyof StdAddressDetail];
              const text = typeof v === "string" ? v.trim() : "";
              return (
                <Row key={key} label={label}>
                  {text || PLACEHOLDER_EMPTY}
                </Row>
              );
            })}

            {/* 创建/更新时间约定放字段最后,见 CLAUDE.md §7 */}
            <Row label="创建时间">{formatDateTime(detail.createdAt)}</Row>
            <Row label="更新时间">{formatDateTime(detail.updatedAt)}</Row>
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">未选择记录。</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** 评分:Decimal 序列化后可能是 string/number,null 显示占位 */
function ScoreText({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">{PLACEHOLDER_EMPTY}</span>;
  }
  const n = Number(value);
  if (Number.isNaN(n)) {
    return <span className="text-muted-foreground">{PLACEHOLDER_EMPTY}</span>;
  }
  return <span className="font-mono">{n.toFixed(1)}</span>;
}