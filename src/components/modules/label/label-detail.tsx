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
import { summarizeLabelDataSources } from "./label-data-summary";
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

/** 把 data 四源渲染成简短摘要(复用列表列的工具函数) */
function renderDataSummary(detail: Detail): string {
  return summarizeLabelDataSources(detail.data);
}

/** 渲染 affix(prefix/suffix):texts 摘要 + skipRate */
function renderAffixSummary(raw: unknown): string {
  if (!raw) return "未配置";
  const a = raw as { texts?: string[]; skipRate?: number } | null;
  if (!a?.texts?.length) return "未配置";
  const texts = a.texts.join("、");
  const skip = a.skipRate && a.skipRate > 0 ? ` (跳过${a.skipRate}%)` : "";
  return `${texts}${skip}`;
}

/** 取 prefix/suffix:统一配置(data 列)优先,旧独立列兜底 */
function getAffix(detail: Detail, key: "prefix" | "suffix"): unknown {
  const data = detail.data as Record<string, unknown> | null | undefined;
  const fromData = data?.[key];
  return fromData !== undefined ? fromData : detail[key];
}

/** 取整体跳过率:统一配置(data 列)优先,旧记录兜底为 0 */
function getSkipRate(detail: Detail): number {
  const data = detail.data as { skipRate?: unknown } | null | undefined;
  const v = data?.skipRate;
  return typeof v === "number" ? v : 0;
}

/** 取干扰率:统一配置(data 列)优先,旧记录兜底为 0 */
function getNoiseRate(detail: Detail): number {
  const data = detail.data as { noiseRate?: unknown } | null | undefined;
  const v = data?.noiseRate;
  return typeof v === "number" ? v : 0;
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
            <Row label="默认数据来源">{renderDataSummary(detail)}</Row>
            <Row label="整体跳过率">{getSkipRate(detail) > 0 ? `${getSkipRate(detail)}%` : "0%"}</Row>
            <Row label="干扰率">{getNoiseRate(detail) > 0 ? `${getNoiseRate(detail)}%` : "0%"}</Row>
            <Row label="默认前缀">{renderAffixSummary(getAffix(detail, "prefix"))}</Row>
            <Row label="默认后缀">{renderAffixSummary(getAffix(detail, "suffix"))}</Row>
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