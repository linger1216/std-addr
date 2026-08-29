"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Divide,
  Download,
  Eye,
  FileJson,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { CandidatePool, LabelStudioItem } from "@/lib/addr-sim/generator";
import type { AddrSimRuleRow } from "./addr-sim-rule-editor";
import { useBuildItems } from "./hooks/use-build-items";
import { sliderNumber } from "@/components/ui/rate-slider";
import { useAddrSimGenerateState } from "./stores/addr-sim-store";
import { AddrSimExportDialog } from "./addr-sim-export-dialog";

/**
 * 生成卡片(底部):
 *  - 总条数设定
 *  - 选中规则按比例分配(百分比,合计 100%)
 *  - 导出前预览前 10 条
 *  - 导出 Label Studio JSON 文件
 */
export function AddrSimGenerateCard({
  rules,
  selectedIds,
  candidates,
}: {
  rules: AddrSimRuleRow[];
  selectedIds: string[];
  candidates: CandidatePool;
}) {
  const { totalCount, ratios, setTotalCount, setRatio, autoBalance, setGenerated } =
    useAddrSimGenerateState();

  const [preview, setPreview] = useState<LabelStudioItem[] | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const { selectedRules, totalPct, valid, counts, buildItems } = useBuildItems({
    rules,
    selectedIds,
    candidates,
    totalCount,
    ratios,
  });

  function handlePreview() {
    if (!valid) return;
    const items = buildItems(10);
    setPreview(items);
    setGenerated(
      items.map((item) => ({ rule: "", item })),
      Date.now(),
    );
  }

  function handleExport() {
    if (!valid) {
      toast.error("请先勾选规则,并保证比例合计为 100%");
      return;
    }
    setExportOpen(true);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium">生成地址</span>
        <div className="ml-2 flex items-center gap-1.5">
          <span className="text-[12px] text-muted-foreground">总条数</span>
          <Input
            type="number"
            value={totalCount}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!Number.isNaN(n)) setTotalCount(n);
            }}
            min={1}
            max={100000}
            className="h-8 w-28 px-2 text-[13px] tabular-nums"
          />
        </div>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={handlePreview} disabled={!valid}>
          <Eye className="size-3.5" />
          预览前 10 条
        </Button>
        <Button size="sm" onClick={handleExport} disabled={!valid}>
          <Download className="size-3.5" />
          导出 Label Studio JSON
        </Button>
      </div>

      {/* 比例分配 */}
      <div className="rounded-xl border border-border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-muted-foreground">
            勾选 {selectedRules.length} 条规则,分别分配生成比例
          </span>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => selectedRules.length > 0 && autoBalance(selectedRules.map((r) => r.id))}
          >
            <Divide className="size-3.5" />
            自动均分
          </Button>
          <span
            className={cn(
              "text-[12px] font-medium tabular-nums",
              totalPct === 100 ? "text-success-fg" : totalPct > 100 ? "text-danger" : "text-warn-fg",
            )}
          >
            合计 {totalPct}%
          </span>
        </div>

        {selectedRules.length === 0 ? (
          <p className="mt-2 text-[12px] text-muted-foreground/70">
            在左侧规则卡片中勾选要参与生成的规则
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            {selectedRules.map((r) => {
              const pct = ratios[r.id] ?? 0;
              const count = counts[selectedRules.indexOf(r)] ?? 0;
              return (
                <div key={r.id} className="flex items-center gap-3">
                  <span className="w-40 truncate text-[12.5px]">{r.name}</span>
                  <div className="flex-1">
                    <Slider
                      value={pct}
                      min={0}
                      max={100}
                      step={5}
                      onValueChange={(v) => setRatio(r.id, sliderNumber(v))}
                    />
                  </div>
                  <Input
                    type="number"
                    value={pct}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (!Number.isNaN(n)) setRatio(r.id, n);
                    }}
                    min={0}
                    max={100}
                    className="h-7 w-16 px-2 text-right text-[12.5px] tabular-nums"
                  />
                  <span className="w-16 text-right text-[11.5px] tabular-nums text-muted-foreground">
                    {count.toLocaleString()} 条
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 样例预览(前 10 条) */}
      {preview && (
        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <div className="flex items-center gap-2">
            <FileJson className="size-3.5 text-muted-foreground" />
            <span className="text-[12px] font-medium text-muted-foreground">
              数据集样例(前 {preview.length} 条)
            </span>
            <div className="flex-1" />
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              {preview.every((p) => p.annotations[0]?.result.length) ? (
                <CheckCircle2 className="size-3 text-success-fg" />
              ) : (
                <XCircle className="size-3 text-danger" />
              )}
              标注分片
            </span>
          </div>
          <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
            {preview.map((p, i) => (
              <div key={i} className="flex items-start gap-2 text-[12px]">
                <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground/60">
                  {i + 1}
                </span>
                <span className="shrink-0 text-foreground">{p.data.address}</span>
                <span className="truncate text-muted-foreground/70">
                  {p.annotations[0]!.result
                    .map((r) => `${r.value.labels[0]}:${r.value.text}`)
                    .join("  ")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    
      {/* 导出 Dialog(from_name / to_name 可编辑) */}
      <AddrSimExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        rules={rules}
        selectedIds={selectedIds}
        candidates={candidates}
      />
</div>
  );
}