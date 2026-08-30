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
import { formatDateTime, parseAddressEntries } from "@/lib/format";
import { parseAliasEntries } from "@/lib/alias-entries";
import type { SubareaDetail } from "./subarea-form";

/** 详情字段 = getById 输出(单一事实来源:subarea-form.tsx,已含 region) */
type Detail = SubareaDetail;

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

export function SubareaDetailDialog({
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
          <DialogTitle>{detail?.name ?? "子区域详情"}</DialogTitle>
          <DialogDescription>只读视图 · 所有字段</DialogDescription>
        </DialogHeader>

        {detail ? (
          <div className="divide-y divide-border/60">
            <Row label="名称">{detail.name}</Row>
            <Row label="别名">
              {/* alias 是 JSON 数组,不展示原始格式:解析后按 1-N 条渲染 */}
              <AliasEntries value={detail.alias} />
            </Row>
            <Row label="所属区划">{orEmpty(detail.region?.name)}</Row>
            <Row label="实体类型">{orEmpty(detail.entityType)}</Row>
            <Row label="属性">
              {detail.property ? <PropertyText value={detail.property} /> : "—"}
            </Row>
            <Row label="状态">
              <StatusBadge status={detail.status} />
            </Row>
            <Row label="地址">
              {/* 地址是 JSON,不展示原始格式:解析后按 1-N 条渲染 */}
              <AddressEntries value={detail.address} />
            </Row>
            {/* 创建/更新时间约定放字段最后,见 CLAUDE.md §7 */}
            <Row label="创建时间">{formatDateTime(detail.createdAt)}</Row>
            <Row label="更新时间">{formatDateTime(detail.updatedAt)}</Row>
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">未选择子区域。</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** 别名条目:解析 JSON 后逐条展示;无内容显示空值占位符 */
function AliasEntries({ value }: { value: unknown }) {
  const lines = parseAliasEntries(value);
  if (lines.length === 0) {
    return <span className="text-muted-foreground">{PLACEHOLDER_EMPTY}</span>;
  }
  return (
    <ul className="space-y-1">
      {lines.map((line, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className="mt-px shrink-0 text-muted-foreground">{i + 1}.</span>
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}

/** 地址条目:解析 JSON 后逐条展示;无内容显示空值占位符 */
function AddressEntries({ value }: { value: unknown }) {
  const lines = parseAddressEntries(value);
  if (lines.length === 0) {
    return <span className="text-muted-foreground">{PLACEHOLDER_EMPTY}</span>;
  }
  return (
    <ul className="space-y-1">
      {lines.map((line, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className="mt-px shrink-0 text-muted-foreground">{i + 1}.</span>
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}

/** 详情属性:每行 "key: 值1、值2" */
function PropertyText({ value }: { value: unknown }) {
  if (value == null || typeof value !== "object") return null;
  const entries = Object.entries(value as Record<string, unknown>);
  return (
    <div className="space-y-0.5">
      {entries.map(([k, v]) => (
        <div key={k} className="text-[12.5px]">
          <span className="text-muted-foreground">{k}:</span>{" "}
          {Array.isArray(v) ? v.join("、") : String(v)}
        </div>
      ))}
    </div>
  );
}
