"use client";

import { useState } from "react";
import {
  Download,
  FileUp,
  ListPlus,
  Loader2,
  Play,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { downloadResultsXlsx } from "@/lib/addr-model/excel-io";
import { api } from "@/trpc/react";
import { AddrModelImportDialog } from "./addr-model-import-dialog";

/** unknown → 可展示字符串(仅 string/number/boolean;其它返回空串) */
function toText(v: unknown): string {
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return String(v);
  }
  return "";
}

/** 批量解析演示:文件导入 / 粘贴 → 内存全量 → 解析 → 仅展示前 10 条 → 导出 Excel */
export function AddrModelBatchDemo({ offline }: { offline: boolean }) {
  const [importOpen, setImportOpen] = useState(false);
  const [draft, setDraft] = useState("闵行区华茂路32弄17号\n上海市新市路1500号");
  const [addresses, setAddresses] = useState<string[]>([]);
  const [results, setResults] = useState<
    Array<{ address: string; data: Record<string, unknown> | null }>
  >([]);
  const [resolving, setResolving] = useState(false);
  /** 已解析条数(解析中实时展示进度) */
  const [doneCount, setDoneCount] = useState(0);

  const batchMutation = api.addrModel.batchParse.useMutation();

  /** 粘贴区 → 追加到内存列表(去掉重复与空) */
  function handleAddFromDraft() {
    const next = draft
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (next.length === 0) {
      toast.warning("粘贴内容为空");
      return;
    }
    const merged = [...addresses];
    for (const a of next) {
      if (!merged.includes(a)) merged.push(a);
    }
    const added = merged.length - addresses.length;
    setAddresses(merged);
    setDraft("");
    toast.success(added > 0 ? `已加入 ${added} 条地址` : "全部为重复地址,未新增");
  }

  function handleImport(addressesFromFile: string[]) {
    const merged = [...addresses];
    let added = 0;
    for (const a of addressesFromFile) {
      if (!merged.includes(a)) {
        merged.push(a);
        added += 1;
      }
    }
    setAddresses(merged);
    toast.success(added > 0 ? `已导入 ${added} 条新地址(去重后共 ${merged.length} 条)` : "无新增(均已存在)");
  }

  function handleClear() {
    setAddresses([]);
    setResults([]);
  }

  /** 分批解析(单次上限 100),合并结果 */
  async function handleResolve() {
    if (addresses.length === 0) {
      toast.warning("请先粘贴或导入地址");
      return;
    }
    setResolving(true);
    setDoneCount(0);
    setResults([]);
    const all: Array<{ address: string; data: Record<string, unknown> | null }> = [];
    try {
      for (let i = 0; i < addresses.length; i += 100) {
        const chunk = addresses.slice(i, i + 100);
        const rows = await batchMutation.mutateAsync({ addresses: chunk });
        all.push(
          ...rows.map((r) => ({
            address: toText(r.address),
            data: (r.data ?? null) as Record<string, unknown> | null,
          })),
        );
        // 每批完成后实时更新进度与结果(按钮数字 + 结果区即时增长)
        setDoneCount(all.length);
        setResults([...all]);
        // 让出事件循环,确保 React 完成渲染后再进入下一批(否则本地模型太快,进度一闪而过)
        await new Promise((resolve) => setTimeout(resolve, 16));
      }
      toast.success(`解析完成:${all.length} 条(成功 ${all.filter((r) => r.data).length} 条)`);
    } catch (err) {
      toast.error(`解析失败:${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setResolving(false);
    }
  }

  function handleExport() {
    if (results.length === 0) {
      toast.warning("暂无解析结果可导出");
      return;
    }
    try {
      downloadResultsXlsx(results);
      toast.success(`已导出 ${results.length} 条解析结果(Excel)`);
    } catch (err) {
      toast.error(`导出失败:${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const preview = results.slice(0, 10);

  return (
    <div className="flex flex-col gap-3">
      {/* 顶部:数据源操作 */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} disabled={resolving} title="Excel/CSV 文件导入地址">
          <FileUp className="size-3.5" />
          导入文件
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleAddFromDraft}
          disabled={!draft.trim()}
        >
          <ListPlus className="size-3.5" />
          加入列表
        </Button>
        <div className="flex-1" />
        {addresses.length > 0 && (
          <>
            <Badge variant="secondary" className="tabular-nums">
              共 {addresses.length} 条
            </Badge>
            <Button size="sm" variant="ghost" onClick={handleClear} className="text-danger hover:bg-danger-soft">
              <Trash2 className="size-3.5" />
              清空
            </Button>
          </>
        )}
        <Button
          size="sm"
          onClick={handleResolve}
          disabled={addresses.length === 0 || resolving || offline}
        >
          {resolving ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Play className="size-3.5" />
          )}
          {resolving ? `解析中…(${doneCount}/${addresses.length})` : `解析全部(${addresses.length})`}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleExport}
          disabled={results.length === 0}
        >
          <Download className="size-3.5" />
          导出 Excel
        </Button>
      </div>

      {/* 数据源:粘贴区(始终紧凑,大列表只显示条数) */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="min-w-0">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            placeholder={"粘贴地址,每行一条(回车加入列表)"}
            className="h-48 resize-none text-[13px]"
            disabled={resolving}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            可直接粘贴,或从 Excel/CSV 导入;大量数据时仅计数,完整列表保存在内存中。
          </p>
        </div>
        <div>
          {addresses.length > 0 ? (
            <div className="h-48 overflow-y-auto rounded-xl border border-border bg-muted/30 p-2">
              {addresses.slice(0, 50).map((a, i) => (
                <div key={i} className="truncate px-1 py-0.5 text-[12px] text-muted-foreground">
                  {i + 1}. {a}
                </div>
              ))}
              {addresses.length > 50 && (
                <div className="px-1 py-0.5 text-[11.5px] text-muted-foreground/70">
                  …共 {addresses.length} 条(仅显示前 50)
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border text-[12.5px] text-muted-foreground/70">
              尚无地址,请粘贴或导入文件
            </div>
          )}
        </div>
      </div>

      {/* 解析进度条(实时) */}
      {resolving && (
        <div className="rounded-xl border border-border bg-muted/30 px-3 py-2">
          <div className="flex items-center justify-between text-[12px]">
            <span className="font-medium text-foreground">
              正在解析 {doneCount} / {addresses.length}
            </span>
            <span className="text-muted-foreground">
              {Math.round((doneCount / Math.max(1, addresses.length)) * 100)}%
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-150"
              style={{
                width: `${(doneCount / Math.max(1, addresses.length)) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* 结果:仅前 10 条展示 */}
      {results.length > 0 && (
        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-medium text-muted-foreground">
              解析结果(展示前 10 条,共 {results.length} 条)
            </span>
            <span className="text-[11px] text-muted-foreground/70">
              完整结果可「导出 Excel」查看
            </span>
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {preview.map((row, i) => (
              <div key={i} className="flex items-start gap-2 text-[12px]">
                <span className="w-5 shrink-0 text-right tabular-nums text-muted-foreground/60">
                  {i + 1}
                </span>
                <span className="w-44 shrink-0 truncate text-foreground">{row.address}</span>
                {row.data ? (
                  <span className="truncate text-muted-foreground/80">
                    {Object.entries(row.data)
                      .filter(([, v]) => v != null && v !== "")
                      .map(([k, v]) => `${k}:${String(v)}`)
                      .join(" | ")}
                  </span>
                ) : (
                  <span className="text-danger/80">解析失败或空地址</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <AddrModelImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={handleImport}
      />
    </div>
  );
}
