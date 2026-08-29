"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Eye } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  computeCountsByRatios,
  generateForRules,
  shuffleArray,
  toLabelStudioExported,
  type CandidatePool,
} from "@/lib/addr-sim/generator";
import type { AddrSimRuleRow } from "./addr-sim-rule-editor";
import { useAddrSimGenerateState } from "./stores/addr-sim-store";

/** 导出文件名前缀 */
const LS_FILE_PREFIX = "label-studio-address";

function downloadJson(json: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(json, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 导出 Dialog:
 *  - 输入 from_name / to_name(默认 "standard" / "address",可二次编辑)
 *  - 预览:前 3 条完整 LS 标注 JSON(实时生成,与导出内容一致)
 *  - 导出:按当前总条数 + 比例生成全部并下载完整 LS 格式文件
 */
export function AddrSimExportDialog({
  open,
  onOpenChange,
  rules,
  selectedIds,
  candidates,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rules: AddrSimRuleRow[];
  selectedIds: string[];
  candidates: CandidatePool;
}) {
  const { totalCount, ratios } = useAddrSimGenerateState();
  const [fromName, setFromName] = useState("standard");
  const [toName, setToName] = useState("address");
  const [shuffle, setShuffle] = useState(false);
  const [exporting, setExporting] = useState(false);

  // 打开时重置为默认值(每次导出独立)
  useEffect(() => {
    if (open) {
      setFromName("standard");
      setToName("address");
      setShuffle(false);
      setExporting(false);
    }
  }, [open]);

  const selectedRules = useMemo(
    () =>
      rules
        .filter((r) => r.status !== 0)
        .filter((r) => selectedIds.includes(r.id))
        .sort((a, b) => selectedIds.indexOf(a.id) - selectedIds.indexOf(b.id)),
    [rules, selectedIds],
  );

  const totalPct = useMemo(
    () => selectedRules.reduce((sum, r) => sum + (ratios[r.id] ?? 0), 0),
    [selectedRules, ratios],
  );
  const valid = selectedRules.length > 0 && totalPct === 100;

  // 按比例换算条数(向下取整 + 余数并入第一条;与预览一致)
  const counts = useMemo(
    () =>
      computeCountsByRatios(
        selectedRules.map((r) => ({ id: r.id, ratio: ratios[r.id] ?? 0 })),
        totalCount,
      ),
    [selectedRules, ratios, totalCount],
  );

  function buildItems(count: number, shuffle = false) {
    const scale = count === totalCount ? counts : computeCountsByRatios(
      selectedRules.map((r) => ({ id: r.id, ratio: ratios[r.id] ?? 0 })),
      count,
    );
    const items = generateForRules(
      selectedRules.map((r) => ({ name: r.name, steps: r.steps })),
      scale,
      { rng: Math.random, candidates },
    );
    return shuffle ? shuffleArray(items) : items;
  }

  // 固定预览前 10 条(与导出同源:same 换算 + 乱序开关影响顺序)
  const previewItems = useMemo(() => {
    if (!valid) return [];
    return toLabelStudioExported(buildItems(Math.min(10, totalCount), shuffle), {
      fromName: fromName.trim() || "standard",
      toName: toName.trim() || "address",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid, fromName, toName, shuffle, selectedRules, ratios, totalCount, candidates]);

  function handleExport() {
    if (!valid) {
      toast.error("请先勾选规则,并保证比例合计为 100%");
      return;
    }
    if (!fromName.trim() || !toName.trim()) {
      toast.error("from_name / to_name 不能为空");
      return;
    }
    setExporting(true);
    try {
      const items = buildItems(totalCount, shuffle);
      const exported = toLabelStudioExported(items, {
        fromName: fromName.trim(),
        toName: toName.trim(),
        fileUpload: `${LS_FILE_PREFIX}-tasks.json`,
      });
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      downloadJson(exported, `${LS_FILE_PREFIX}-${stamp}.json`);
      toast.success(`已导出 ${exported.length} 条 LS 标注任务`);
    } catch (err) {
      toast.error(`导出失败:${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onOpenChange(false);
      }}
    >
      <DialogContent className="max-w-3xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>导出 Label Studio 标注文件</DialogTitle>
          <DialogDescription>
            导出为 LS 完整标注任务格式(含 data + annotations.result 分片)。from_name /
            to_name 默认 standard / address,可修改。
          </DialogDescription>
        </DialogHeader>

        {/* from_name / to_name */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[12px] text-muted-foreground">from_name</Label>
            <Input
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="standard"
              className="h-8 w-44 text-[13px]"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[12px] text-muted-foreground">to_name</Label>
            <Input
              value={toName}
              onChange={(e) => setToName(e.target.value)}
              placeholder="address"
              className="h-8 w-44 text-[13px]"
            />
          </div>
          {/* 乱序导出开关 */}
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-muted-foreground">乱序</span>
            <Switch
              checked={shuffle}
              onCheckedChange={setShuffle}
              aria-label="乱序导出"
            />
          </div>
          <div className="text-[12px] text-muted-foreground">
            将导出 <span className="font-medium tabular-nums text-foreground">{valid ? totalCount : 0}</span> 条
            {!valid && <span className="ml-1 text-danger">(请勾选规则并确保占比合计 100%)</span>}
          </div>
        </div>

        {/* 预览前 3 条(前后缀 JSON) */}
        <div className="min-w-0 rounded-xl border border-border bg-muted/30">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Eye className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="text-[12px] font-medium text-muted-foreground">
              预览(前 10 条,完整 LS 格式)
            </span>
          </div>
          <pre className="max-h-72 w-full overflow-x-auto overflow-y-auto px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
            {previewItems.length > 0
              ? JSON.stringify(previewItems, null, 2)
              : "勾选规则且占比合计 100% 后可预览"}
          </pre>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={exporting}
          >
            取消
          </Button>
          <Button type="button" onClick={handleExport} disabled={!valid || exporting}>
            <Download className="size-3.5" />
            {exporting ? "导出中…" : `导出 ${valid ? totalCount : 0} 条标注`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}