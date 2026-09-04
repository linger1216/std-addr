"use client";

import { ArrowDown, ArrowUp, Eye, Pencil, RefreshCw, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { ScoreText } from "@/components/ui/score-text";
import { orEmpty } from "@/lib/constants";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { STD_ADDRESS_FIELDS } from "./std-address-fields";
import type { StdAddressRow } from "./std-address-table";

/** 卡片视图可排序字段(对齐后端 sort 白名单) */
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "rawAddress", label: "原始地址" },
  { value: "stdAddress", label: "标准地址" },
  { value: "stdScore", label: "评分" },
  { value: "status", label: "状态" },
  { value: "createdAt", label: "创建时间" },
];

export function StdAddressCardGrid({
  rows,
  isLoading,
  rowSelection,
  onToggleRow,
  onToggleAll,
  sorting,
  onSortChange,
  callbacks,
}: {
  rows: StdAddressRow[];
  isLoading: boolean;
  rowSelection: Record<string, boolean>;
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
  sorting: { id: string; desc: boolean }[];
  onSortChange: (next: { id: string; desc: boolean }[]) => void;
  callbacks: {
    onView?: (r: StdAddressRow) => void;
    onEdit?: (r: StdAddressRow) => void;
    onDelete?: (r: StdAddressRow) => void;
    /** 重新解析并落库(不带 debug,直接赋值) */
    onParse?: (r: StdAddressRow) => void;
  };
}) {
  const allSelected = rows.length > 0 && rows.every((r) => rowSelection[r.id]);
  const someSelected = rows.some((r) => rowSelection[r.id]);
  const current = sorting[0];

  function handleFieldChange(value: string) {
    onSortChange([{ id: value, desc: current?.desc ?? false }]);
  }
  function toggleDesc() {
    if (!current) return;
    onSortChange([{ id: current.id, desc: !current.desc }]);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* 头部:本页全选 + 排序条(卡片无列头,用下拉排序) */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Checkbox
            checked={allSelected}
            indeterminate={someSelected && !allSelected}
            onCheckedChange={onToggleAll}
            aria-label="全选本页"
          />
          全选本页
        </label>
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] text-muted-foreground">排序</span>
          <select
            value={current?.id ?? ""}
            onChange={(e) => handleFieldChange(e.target.value)}
            className="h-8 rounded-xl border border-border bg-card px-2 text-[13px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="" disabled>
              默认
            </option>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={toggleDesc}
            disabled={!current}
            aria-label="切换升/降序"
          >
            {current?.desc ? (
              <ArrowDown className="size-3.5" />
            ) : (
              <ArrowUp className="size-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* 卡片网格 */}
      {isLoading ? (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-xl border border-border bg-muted/40"
            />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-[13px] text-muted-foreground">
          暂无标准地址记录
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto pr-0.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((r) => (
            <StdAddressCard
              key={r.id}
              row={r}
              selected={Boolean(rowSelection[r.id])}
              onToggleRow={onToggleRow}
              callbacks={callbacks}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StdAddressCard({
  row,
  selected,
  onToggleRow,
  callbacks,
}: {
  row: StdAddressRow;
  selected: boolean;
  onToggleRow: (id: string) => void;
  callbacks: {
    onView?: (r: StdAddressRow) => void;
    onEdit?: (r: StdAddressRow) => void;
    onDelete?: (r: StdAddressRow) => void;
    /** 重新解析并落库(不带 debug,直接赋值) */
    onParse?: (r: StdAddressRow) => void;
  };
}) {
  // 仅展示有值的地址要素(标签:值)
  const filled = STD_ADDRESS_FIELDS.filter(([key]) => {
    const v = row[key as keyof StdAddressRow];
    return typeof v === "string" && v.trim() !== "";
  });

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border bg-card p-3 transition-colors",
        selected
          ? "border-primary/50 bg-primary/5"
          : "border-border hover:border-border/70 hover:bg-accent/30",
      )}
    >
      {/* 顶部:勾选 + 原始地址 + 状态/评分 */}
      <div className="flex items-start gap-2">
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleRow(row.id)}
          aria-label={`选择 ${row.rawAddress}`}
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1">
          <div className="break-all text-[13px] font-medium text-foreground">
            {row.rawAddress}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusBadge status={row.status} />
        </div>
      </div>

      {/* 中部:标准地址(输出重点) */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5 font-mono text-[12px] text-foreground/90 break-all">
        {orEmpty(row.stdAddress) || "（未标准化）"}
      </div>

      {/* 下部:有值要素 tag 云 */}
      {filled.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {filled.map(([key, label]) => (
            <Badge
              key={key}
              variant="secondary"
              className="text-[10.5px] font-normal"
            >
              <span className="text-muted-foreground">{label}:</span>
              <span className="ml-1">
                {row[key as keyof StdAddressRow] as string}
              </span>
            </Badge>
          ))}
        </div>
      )}

      {/* 底部:创建时间 + 行操作 */}
      <div className="flex items-center justify-between border-t border-border/60 pt-1.5">

        <ScoreText value={row.stdScore} />
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => callbacks.onParse?.(row)}
            className="h-7 px-2 text-xs font-normal text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="size-3.5" />
            解析
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => callbacks.onView?.(row)}
            className="h-7 px-2 text-xs font-normal text-muted-foreground hover:text-foreground"
          >
            <Eye className="size-3.5" />
            查看
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => callbacks.onEdit?.(row)}
            className="h-7 px-2 text-xs font-normal text-muted-foreground hover:text-foreground"
          >
            <Pencil className="size-3.5" />
            编辑
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => callbacks.onDelete?.(row)}
            className="h-7 px-2 text-xs font-normal text-danger hover:bg-danger-soft hover:text-danger"
          >
            <Trash2 className="size-3.5" />
            删除
          </Button>
        </div>
      </div>
    </div>
  );
}

