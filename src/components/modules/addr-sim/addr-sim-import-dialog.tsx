"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, FileUp, Upload } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  extractRules,
  summarizeExtraction,
  computeRadios,
  type ExtractedRule,
} from "@/lib/addr-sim/extract-rules";

/**
 * 从 Label Studio 标注文件提取规则 Dialog。
 *
 * 流程:
 *  1. 用户选择 .json 文件(FileReader 客户端解析,不上传)
 *  2. extractRules + summarizeExtraction → 显示摘要 + 候选规则列表
 *  3. 用户勾选 + 「导入选中规则」→ 逐条调用 onImportOne,Dialog 内实时显示进度
 *     (已导入 N/M · 失败 X · 首条失败原因)
 *  4. 全部完成 → onImportComplete(result) 由父级统一刷新列表 + 汇总提示 + 关闭
 *
 * 关闭时清空所有 state,确保下次打开是干净状态。
 */
export function AddrSimImportDialog({
  open,
  onOpenChange,
  labels,
  existingRuleNames,
  onImportOne,
  onImportComplete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  labels: Array<{ name: string; label: string }>;
  existingRuleNames: string[];
  /** 逐条导入(父级实现 ruleCreate,返回 Promise);失败时抛错 */
  onImportOne: (rule: {
    name: string;
    steps: ExtractedRule["steps"];
    radio: number;
  }) => Promise<void>;
  /** 全部导入完成回调(父级刷新列表 + 汇总提示 + 关闭) */
  onImportComplete: (result: {
    success: number;
    failed: number;
    total: number;
    /** 首条失败原因(没有失败时为 null) */
    lastError: string | null;
  }) => Promise<void> | void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [parsing, setParsing] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rules, setRules] = useState<ExtractedRule[]>([]);
  const [unknownLabels, setUnknownLabels] = useState<string[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [parseError, setParseError] = useState<string | null>(null);
  // 选中状态:用 rule.name 作为 key(同 name 不会出现在去重结果里)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // 导入进度(导入中非 null)
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
    failed: number;
    lastError: string | null;
  } | null>(null);

  // 现有规则名集合(快速查重)
  const existingSet = useMemo(() => new Set(existingRuleNames), [existingRuleNames]);

  /** 重置全部状态(关闭时调用,保证下次打开是干净状态) */
  function resetState() {
    setParsing(false);
    setFileName(null);
    setRules([]);
    setUnknownLabels([]);
    setTotalRecords(0);
    setParseError(null);
    setSelected(new Set());
    setImporting(false);
    setProgress(null);
  }

  // 打开时清空解析/选择态;关闭时全量重置
  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setParseError(null);
      setImporting(false);
      setProgress(null);
    } else {
      resetState();
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [open]);

  function pickFile() {
    inputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setParseError(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const raw: unknown = JSON.parse(text);
      const extracted = extractRules(raw, { labels });
      const summary = summarizeExtraction(raw, { labels }, extracted);
      setRules(extracted);
      setUnknownLabels(summary.unknownLabels);
      setTotalRecords(summary.totalRecords);
      // 默认勾选出现次数最多的前 10 条(TOPN 快捷选择语义),用户可再调整
      setSelected(
        new Set(
          extracted
            .slice(0, Math.min(10, extracted.length))
            .map((r) => r.name),
        ),
      );
      if (extracted.length === 0) {
        toast.warning("未提取到任何规则,请检查文件内容");
      } else {
        toast.success(
          `提取到 ${extracted.length} 条规则(共 ${summary.totalRecords} 条样本),已预选前 ${Math.min(10, extracted.length)} 条`,
        );
      }
    } catch (err) {
      setRules([]);
      setUnknownLabels([]);
      setTotalRecords(0);
      const msg = err instanceof Error ? err.message : String(err);
      setParseError(msg);
      toast.error(`文件解析失败:${msg}`);
    } finally {
      setParsing(false);
    }
  }

  function toggleOne(name: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(name);
      else next.delete(name);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    if (checked) {
      setSelected(new Set(rules.map((r) => r.name)));
    } else {
      setSelected(new Set());
    }
  }

  async function handleImportSelected() {
    const filtered = rules.filter((r) => selected.has(r.name));
    if (filtered.length === 0) return;
    // 占比 = 各规则出现次数相对于"选中规则样本总数"的百分比(最大余数法,合计恒 100)
    const radios = computeRadios(filtered.map((r) => r.count));
    const picked = filtered.map((r, i) => ({
      name: r.name,
      steps: r.steps,
      radio: radios[i] ?? 1,
    }));

    setImporting(true);
    setProgress({ done: 0, total: picked.length, failed: 0, lastError: null });

    let failed = 0;
    let lastError: string | null = null;
    for (let i = 0; i < picked.length; i++) {
      try {
        await onImportOne(picked[i]!);
      } catch (err) {
        failed += 1;
        lastError = err instanceof Error ? err.message : String(err);
      }
      setProgress({
        done: i + 1,
        total: picked.length,
        failed,
        lastError,
      });
    }

    setImporting(false);
    await onImportComplete({
      success: picked.length - failed,
      failed,
      total: picked.length,
      lastError,
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onOpenChange(false);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>从数据提取规则</DialogTitle>
          <DialogDescription>
            上传 Label Studio 标注 JSON 文件,自动提取要素序列作为规则骨架(仅导入规则,值留空待编辑)
          </DialogDescription>
        </DialogHeader>

        {/* 上传区 */}
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            onClick={pickFile}
            disabled={parsing}
          >
            <Upload className="size-3.5" />
            选择文件
          </Button>
          {fileName && (
            <span className="truncate text-[12.5px] text-muted-foreground">
              {fileName}
            </span>
          )}
          {parsing && <Spinner size="sm" />}
          {parseError && (
            <span className="truncate text-[12px] text-danger">{parseError}</span>
          )}
        </div>

        {/* 解析摘要(>=1 条记录时显示) */}
        {(rules.length > 0 || totalRecords > 0) && (
          <div className="rounded-xl border border-border bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground">
            共 <span className="font-medium tabular-nums">{totalRecords}</span>{" "}
            条样本,去重后 <span className="font-medium tabular-nums">{rules.length}</span>{" "}
            条规则
            {unknownLabels.length > 0 && (
              <>
                {" · 忽略 "}
                <span className="font-medium tabular-nums">{unknownLabels.length}</span>{" "}
                个未知 label:
                <span className="ml-1 inline-flex flex-wrap gap-1">
                  {unknownLabels.slice(0, 6).map((u) => (
                    <Badge
                      key={u}
                      variant="outline"
                      className="text-[10.5px] text-muted-foreground"
                    >
                      {u}
                    </Badge>
                  ))}
                  {unknownLabels.length > 6 && (
                    <span className="text-[10.5px]">…</span>
                  )}
                </span>
              </>
            )}
          </div>
        )}

        {/* 快捷选择:按出现次数取前 N 条(rules 已按 count 降序) */}
        {rules.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                [10, "Top10", "bg-primary text-primary-foreground hover:bg-primary/90"],
                [20, "Top20", "bg-success-soft text-success-fg hover:bg-success-soft/80"],
                [50, "Top50", "bg-warn-soft text-warn-fg hover:bg-warn-soft/80"],
              ] as const
            ).map(([n, label, tone]) => (
              <Button
                key={n}
                type="button"
                size="sm"
                onClick={() =>
                  setSelected(
                    new Set(
                      rules
                        .slice(0, Math.min(n, rules.length))
                        .map((r) => r.name),
                    ),
                  )
                }
                disabled={selected.size === rules.length && rules.length <= n}
                className={tone}
                title={`选择出现次数最多的前 ${Math.min(n, rules.length)} 条规则`}
              >
                {label}
              </Button>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => toggleAll(true)}
              disabled={rules.length === 0}
            >
              全选
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => toggleAll(false)}
              disabled={selected.size === 0}
            >
              全不选
            </Button>
            <span className="text-[12px] text-muted-foreground">
              已选 <span className="font-medium tabular-nums">{selected.size}</span> /{" "}
              {rules.length}
            </span>
          </div>
        )}

        {/* 候选规则列表 */}
        {rules.length > 0 ? (
          <div className="max-h-80 overflow-y-auto rounded-xl border border-border">
            <div className="flex flex-col divide-y divide-border">
              {rules.map((r) => {
                const exists = existingSet.has(r.name);
                const checked = selected.has(r.name);
                return (
                  <label
                    key={r.name}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors",
                      checked ? "bg-primary/5" : "hover:bg-muted/30",
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => toggleOne(r.name, v === true)}
                      aria-label={`选择规则 ${r.name}`}
                      className="mt-0.5"
                      disabled={importing}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[13px] font-medium">
                          {r.name || "(未命名)"}
                        </span>
                        <Badge variant="secondary" className="text-[10.5px]">
                          × {r.count} 次
                        </Badge>
                        {r.unknownLabels.length > 0 && (
                          <Badge
                            variant="outline"
                            className="border-warn-fg/50 bg-warn-soft text-[10.5px] text-warn-fg"
                            title={`未知 label: ${r.unknownLabels.join("、")}`}
                          >
                            <AlertTriangle className="size-3" />
                            未知 label × {r.unknownLabels.length}
                          </Badge>
                        )}
                        {exists && (
                          <Badge
                            variant="outline"
                            className="border-warn-fg/50 text-[10.5px] text-warn-fg"
                          >
                            已存在
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {r.steps.map((s, i) => (
                          <Badge
                            key={i}
                            variant="outline"
                            className="font-mono text-[10.5px]"
                          >
                            {s.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        ) : (
          !parsing &&
          fileName && (
            <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-[12.5px] text-muted-foreground">
              该文件未提取到任何规则
            </p>
          )
        )}

        {/* 导入进度(导入中显示) */}
        {importing && progress && (
          <div className="rounded-xl border border-border bg-muted/30 px-3 py-2.5">
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-medium text-foreground">
                正在导入 {progress.done} / {progress.total}
              </span>
              <span
                className={
                  progress.failed > 0 ? "text-danger" : "text-muted-foreground"
                }
              >
                成功 {progress.done - progress.failed} · 失败 {progress.failed}
              </span>
            </div>
            {/* 简易进度条 */}
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200"
                style={{
                  width: `${((progress.done - progress.failed) / Math.max(1, progress.total)) * 100}%`,
                }}
              />
            </div>
            {progress.lastError && (
              <p className="mt-1.5 truncate text-[11.5px] text-danger" title={progress.lastError}>
                失败原因:{progress.lastError}
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={importing}
          >
            取消
          </Button>
          <Button
            type="button"
            onClick={handleImportSelected}
            disabled={selected.size === 0 || importing || parsing}
          >
            {importing ? (
              <>
                <Spinner size="sm" />
                导入中 {progress?.done ?? 0}/{progress?.total ?? 0}
              </>
            ) : (
              <>
                <FileUp className="size-3.5" />
                导入选中规则 ({selected.size})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}