"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownWideNarrow,
  Copy,
  FileText,
  FileUp,
  Gauge,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { allocateByOrder } from "@/lib/addr-sim/radios";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  type AddrSimRuleRow,
} from "./addr-sim-rule-editor";
import { useAddrSimActions } from "./stores/addr-sim-store";

/** 列表排序模式 */
type SortMode = "created" | "radio" | "name";

/**
 * 规则列表(左侧卡片):
 *  - 多选 checkbox(供生成卡片批量勾选)
 *  - 行点击 → 打开编辑
 *  - 新建 / 单条删除
 */
export function AddrSimRuleList({
  rules,
  selectedIds,
  editingId,
  onToggleSelect,
  onOpenEdit,
  onCreate,
  onImport,
  onCopy,
  onDelete,
  onDeleteMany,
  onQuickAllocate,
}: {
  rules: AddrSimRuleRow[];
  selectedIds: string[];
  editingId: string | null;
  onToggleSelect: (id: string, radio?: number | null) => void;
  onOpenEdit: (rule: AddrSimRuleRow) => void;
  onCreate: () => void;
  onImport: () => void;
  /** 复制规则:完整复制(仅名字不同) */
  onCopy: (rule: AddrSimRuleRow) => void;
  onDelete: (rule: AddrSimRuleRow) => void;
  onDeleteMany: (ids: string[]) => void;
  /** 按权重分配占比:pairs = [{ id, radio }](由本组件按当前排序计算,父级批量落库) */
  onQuickAllocate: (pairs: Array<{ id: string; radio: number }>) => void;
}) {
  const setSelected = useAddrSimActions().setSelected;
  const [sortMode, setSortMode] = useState<SortMode>("radio");
  /** 快速分配占比和(选中规则的占比合计,如 60) */
  const [quickTotal, setQuickTotal] = useState("");

  const sortedRules = useMemo(() => {
    const list = [...rules];
    if (sortMode === "radio") {
      // 占比降序(未设置占比的排最后,占比相同按名称)
      list.sort(
        (a, b) =>
          (b.radio ?? -1) - (a.radio ?? -1) ||
          a.name.localeCompare(b.name, "zh-Hans-CN"),
      );
    } else if (sortMode === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
    }
    // "created" 保持后端传入顺序(createdAt desc)
    return list;
  }, [rules, sortMode]);

  /** 已选规则的占比合计(提示是否已 100%) */
  const selectedRadioSum = rules
    .filter((r) => selectedIds.includes(r.id))
    .reduce((sum, r) => sum + (r.radio ?? 0), 0);

  /** 快捷选择:按当前排序取前 N 条 */
  function selectTop(n: number) {
    const top = sortedRules.slice(0, Math.min(n, sortedRules.length)).map((r) => r.id);
    setSelected(top);
  }

  /** 选中规则按当前排序的有序列表(快速分配按此顺序递减权重) */
  const orderedSelected = useMemo(
    () => sortedRules.filter((r) => selectedIds.includes(r.id)),
    [sortedRules, selectedIds],
  );

  /** 快速分配占比:校验占比和 → 按当前排序递减权重分配 → 父级批量落库 */
  function handleQuickAllocate() {
    const n = orderedSelected.length;
    if (n === 0) {
      toast.warning("请先勾选要分配占比的规则");
      return;
    }
    const total = Number(quickTotal);
    if (!Number.isFinite(total) || total <= 0) {
      toast.error("请填写占比和(如 60)");
      return;
    }
    if (total < n) {
      toast.error(`占比和不能小于规则数(${n})`);
      return;
    }
    if (total > 100) {
      toast.error("占比和不能超过 100%");
      return;
    }
    // 按权重 N, N-1, …, 1 分配:第一个规则占比最多,差额自动计算
    const shares = allocateByOrder(n, Math.round(total));
    onQuickAllocate(
      orderedSelected.map((r, i) => ({ id: r.id, radio: shares[i]! })),
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium">规则</span>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={onImport}>
            <FileUp className="size-3.5" />
            从数据提取
          </Button>
          <Button size="sm" onClick={onCreate}>
            <Plus className="size-3.5" />
            新建规则
          </Button>
        </div>
      </div>

      {/* 快捷选择(卡片上方):按当前排序取前 N / 全选 / 全不选 */}
      {sortedRules.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] font-medium text-muted-foreground">快捷选择</span>
          {[10, 20, 50].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => selectTop(n)}
              className="rounded-lg bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
              title={`选择当前排序前 ${Math.min(n, sortedRules.length)} 条`}
            >
              Top{Math.min(n, sortedRules.length)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSelected(sortedRules.map((r) => r.id))}
            disabled={sortedRules.length === 0}
            className="rounded-lg border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-40"
          >
            全选
          </button>
          <button
            type="button"
            onClick={() => setSelected([])}
            disabled={selectedIds.length === 0}
            className="rounded-lg border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-40"
          >
            全不选
          </button>
          <span
            className={cn(
              "ml-1 text-[11.5px] tabular-nums",
              selectedIds.length === 0
                ? "text-muted-foreground"
                : selectedRadioSum === 100
                  ? "font-medium text-success-fg"
                  : "text-warn-fg",
            )}
            title="已选规则的占比合计(生成需等于 100%)"
          >
            占比合计 {selectedRadioSum}%
          </span>
        </div>
      )}

      {/* 排序切换 */}
      {sortedRules.length > 0 && (
        <div className="flex items-center gap-1">
          <ArrowDownWideNarrow className="size-3.5 text-muted-foreground/70" />
          {(
            [
              ["created", "时间"],
              ["radio", "占比"],
              ["name", "名称"],
            ] as Array<[SortMode, string]>
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setSortMode(mode)}
              className={cn(
                "rounded-lg border px-2 py-0.5 text-[11.5px] transition-colors",
                sortMode === mode
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* 快速分配占比:先勾选 N 条 → 直接设定占比和(如 60%)→ 按当前排序递减权重自动分配 */}
      {sortedRules.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Gauge className="size-3.5 text-muted-foreground/70" />
          <span className="text-[12px] font-medium text-muted-foreground">
            快速分配
          </span>
          <Input
            type="number"
            value={quickTotal}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "" || /^\d*\.?\d*$/.test(v)) setQuickTotal(v);
            }}
            placeholder="占比和"
            disabled={orderedSelected.length === 0}
            min={orderedSelected.length}
            max={100}
            className="h-7 w-[70px] px-2 text-right text-[12px] tabular-nums"
            title={`选中 ${orderedSelected.length} 条规则的占比合计,如 60`}
          />
          <span className="text-[11.5px] text-muted-foreground">%</span>
          <Button
            size="sm"
            variant="outline"
            onClick={handleQuickAllocate}
            disabled={orderedSelected.length === 0}
            className="h-7 px-2.5 text-[11.5px]"
          >
            按权重分配
          </Button>
          <span
            className="hidden text-[11px] text-muted-foreground/70 sm:inline"
            title="按当前排序递减权重(N, N-1, …, 1)分配,第一个规则占比最多"
          >
            按当前排序,第一条占比最多
          </span>
        </div>
      )}

      {rules.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-[12.5px] text-muted-foreground">
          还没有规则,点击「新建规则」开始配置
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {sortedRules.map((r) => {
            const active = r.id === editingId;
            const selected = selectedIds.includes(r.id);
            const disabled = r.status === 0;
            return (
              <div
                key={r.id}
                onClick={() => onOpenEdit(r)}
                className={cn(
                  "group flex cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-2 transition-colors",
                  disabled && "opacity-55",
                  active
                    ? "border-primary/60 bg-primary/5"
                    : "border-border hover:border-primary/40 hover:bg-muted/40",
                )}
              >
                <Checkbox
                  checked={selected}
                  onCheckedChange={() => onToggleSelect(r.id, r.radio)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`选择规则 ${r.name}`}
                />
                <FileText className="size-3.5 shrink-0 text-muted-foreground/60" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px]">{r.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {r.steps.length} 个步骤
                    {typeof r.radio === "number" && (
                      <span className="ml-1.5 rounded bg-warn-soft px-1 py-px text-[10px] text-warn-fg">
                        占比 {r.radio}%
                      </span>
                    )}
                    {typeof r.count === "number" && (
                      <span className="ml-1.5 text-[10px] text-muted-foreground">
                        样本 {r.count}
                        {typeof r.total === "number" ? `/${r.total}` : ""}
                      </span>
                    )}
                    {r.status === 0 && (
                      <span className="ml-1.5 rounded bg-danger-soft px-1 py-px text-[10px] text-danger">
                        已禁用
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`复制规则 ${r.name}`}
                  title="完整复制此规则(名字加副本身份)"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCopy(r);
                  }}
                  className="flex size-7 items-center justify-center rounded-lg text-muted-foreground/50 transition-colors hover:bg-primary/10 hover:text-primary"
                >
                  <Copy className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={`删除规则 ${r.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(r);
                  }}
                  className="flex size-7 items-center justify-center rounded-lg text-muted-foreground/50 transition-colors hover:bg-danger-soft hover:text-danger"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
        <span className="text-[12px] text-muted-foreground">
          已选 <span className="font-medium tabular-nums">{selectedIds.length}</span> /{" "}
          {sortedRules.length}
        </span>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="outline"
          onClick={() => onDeleteMany(selectedIds)}
          disabled={selectedIds.length === 0}
          className="text-danger hover:bg-danger-soft"
        >
          <Trash2 className="size-3.5" />
          批量删除
        </Button>
      </div>
    </div>
  );
}
