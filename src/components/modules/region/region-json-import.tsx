"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileJson, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  flattenRegionJson,
  injectRegionAdminRoots,
  type RegionJsonOrgNode,
} from "@/lib/region-import";
import { toErrorMessage } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Parsed = {
  /** region.json envelope 的 data 数组(原样传给后端) */
  data: RegionJsonOrgNode[];
  /** 按导入规则可生成的区划节点数(复用服务端同一套转换) */
  importable: number;
  skipped: { uncoded: number; echo: number; duplicate: number; nameFiltered: number };
  warnings: string[];
};

/** 解析 region.json:兼容 {code,msg,data:[...]} envelope 与裸数组 */
function parseFile(text: string): Parsed {
  const json = JSON.parse(text) as unknown;
  const data = Array.isArray(json)
    ? json
    : (json as { data?: unknown }).data;
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("文件结构不正确:期望 { code, msg, data: [...] } 或根数组");
  }
  const summary = flattenRegionJson(data as RegionJsonOrgNode[]);
  // 预览与后端导入一致:自动补全 上海市/闵行区 根并按 type 重算 level
  const importable = injectRegionAdminRoots(summary.items).length;
  return {
    data: data as RegionJsonOrgNode[],
    importable,
    skipped: summary.skipped,
    warnings: summary.warnings,
  };
}

/**
 * region.json 覆盖导入弹窗:
 * - 前端解析(JSON.parse + 同一套 flattenRegionJson 规则预览)
 * - 明确提示"覆盖":导入后与现有数据按 code 合并,文件里消失的编码整批删除
 * - 只把 envelope 的 data 数组交给后端 import procedure
 */
export function RegionJsonImportDialog({
  open,
  onOpenChange,
  currentCount,
  isPending,
  onImport,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** 当前 region 总数(用于覆盖警告文案) */
  currentCount: number;
  isPending: boolean;
  onImport: (data: RegionJsonOrgNode[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFileName(null);
    setParsed(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFile(file: File) {
    setFileName(file.name);
    setParsed(null);
    setError(null);
    try {
      const text = await file.text();
      setParsed(parseFile(text));
    } catch (err) {
      setError(`解析失败:${toErrorMessage(err)}`);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>导入 region.json</DialogTitle>
          <DialogDescription>
            导入后覆盖原有行政区划数据:{currentCount > 0 ? `当前共 ${currentCount} 条` : "当前无数据"}。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 文件选择 */}
          <label
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-6 py-8 text-center transition-colors",
              fileName
                ? "border-success/40 bg-success-soft/50"
                : "border-border hover:border-foreground/40 hover:bg-muted/40",
            )}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            {fileName ? (
              <>
                <CheckCircle2 className="size-6 text-success-fg" />
                <span className="text-[13.5px] font-medium">{fileName}</span>
                <span className="text-xs text-muted-foreground">点击可重新选择文件</span>
              </>
            ) : (
              <>
                <FileJson className="size-6 text-muted-foreground" />
                <span className="text-[13.5px] font-medium">选择 region.json 文件</span>
                <span className="text-xs text-muted-foreground">
                  即 {`{ code, msg, data: [...] }`} 结构的区划导出文件
                </span>
              </>
            )}
          </label>

          {/* 解析预览 */}
          {error && (
            <p className="rounded-xl bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
              {error}
            </p>
          )}
          {parsed && (
            <div className="space-y-2 rounded-xl border border-border bg-secondary/40 p-3.5 text-[12.5px]">
              <p className="flex items-center gap-1.5 font-medium text-foreground">
                <Upload className="size-3.5" />
                文件解析完成:可导入区划节点 {parsed.importable} 个
              </p>
              <p className="text-muted-foreground">
                已跳过:无编码 {parsed.skipped.uncoded} / 继承父级编码{" "}
                {parsed.skipped.echo} / 重复编码 {parsed.skipped.duplicate} /{" "}
                非区划名称 {parsed.skipped.nameFiltered}
              </p>
              {parsed.warnings.map((w) => (
                <p key={w} className="text-muted-foreground">
                  · {w}
                </p>
              ))}
              {parsed.importable === 0 && (
                <p className="text-danger">文件中没有任何可导入的区划节点,无法导入。</p>
              )}
            </div>
          )}

          {/* 覆盖警告 */}
          {parsed && parsed.importable > 0 && (
            <p className="flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[12.5px] leading-relaxed text-danger">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              覆盖确认:导入将按编码合并现有数据,文件中不再出现的编码会被删除
              {currentCount > 0 ? `(最多影响 ${currentCount} 条现有记录)` : ""}
              ,此操作不可撤销。
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            disabled={!parsed || parsed.importable === 0 || isPending}
            onClick={() => parsed && onImport(parsed.data)}
          >
            {isPending ? "导入中…" : "确认导入并覆盖"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}