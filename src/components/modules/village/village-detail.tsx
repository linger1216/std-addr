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
  name: string;
  alias: string | null;
  regionId: string | null;
  region?: { id: string; name: string } | null;
  status: number;
  geom: unknown;
  createdAt: Date;
  updatedAt: Date;
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

function fmtDate(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toLocaleString("zh-CN", { hour12: false });
}

function fmtJson(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return "—";
    try {
      return JSON.stringify(JSON.parse(s), null, 2);
    } catch {
      return s;
    }
  }
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return Object.prototype.toString.call(v);
  }
}

export function VillageDetailDialog({
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
          <DialogTitle>{detail?.name ?? "村详情"}</DialogTitle>
          <DialogDescription>只读视图 · 所有字段</DialogDescription>
        </DialogHeader>

        {detail ? (
          <div className="divide-y divide-border/60">
            <Row label="名称">{detail.name}</Row>
            <Row label="别名">{detail.alias ?? "—"}</Row>
            <Row label="所属区划">{detail.region?.name ?? "—"}</Row>
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
            <Row label="几何 (JSON)">
              <pre className="max-h-32 overflow-auto rounded-lg bg-secondary/60 p-2 font-mono text-[11.5px] leading-relaxed">
                {fmtJson(detail.geom)}
              </pre>
            </Row>
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">未选择村。</p>
        )}
      </DialogContent>
    </Dialog>
  );
}