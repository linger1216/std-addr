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
import type { StdAddressDetail } from "./std-address-form";

/** 27 个地址要素的中文标签(与表列名一一对应) */
const FIELD_LABELS: Array<[keyof StdAddressDetail, string]> = [
  ["province", "省"],
  ["city", "市"],
  ["district", "区/县"],
  ["street", "街道"],
  ["town", "镇"],
  ["township", "乡"],
  ["community", "小区/社区"],
  ["village", "村"],
  ["subarea", "子区域"],
  ["zhai", "宅"],
  ["road", "路"],
  ["lane", "弄"],
  ["alley", "巷"],
  ["subLane", "支弄"],
  ["roadNumber", "路号"],
  ["building", "楼栋"],
  ["unit", "单元"],
  ["team", "队"],
  ["groupField", "组"],
  ["floor", "楼层"],
  ["room", "室号"],
  ["direction", "方向"],
  ["other", "其它"],
  ["poi", "POI"],
  ["expressway", "高速"],
  ["highway", "国道/公路"],
  ["locationType", "区位类型"],
];

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

            {/* 27 个地址要素:仅展示已命中(非空)的要素 */}
            {FIELD_LABELS.map(([key, label]) => {
              const v = detail[key];
              const text = typeof v === "string" ? v.trim() : "";
              if (!text) return null;
              return <Row key={key} label={label}>{text}</Row>;
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