"use client";

import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Play } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { SearchSelect, type SearchSelectOption } from "@/components/ui/search-select";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  columnOptions,
  detectHeaderRow,
  extractAddresses,
  readWorkbook,
} from "@/lib/addr-model/excel-io";

/**
 * 批量解析 · 文件导入 Dialog:
 *  - 上传 Excel/CSV → 选择 sheet(多 sheet 时)→ 预览前几行 → 选择地址列 → 导入
 *  - 支持自动检测表头行
 */
export function AddrModelImportDialog({
  open,
  onOpenChange,
  onImport,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 导入地址列表回调(去重由调用方决定,这里只透传) */
  onImport: (addresses: string[]) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [sheet, setSheet] = useState<string>("");
  const [rows, setRows] = useState<string[][]>([]);
  const [headerRow, setHeaderRow] = useState<number | null>(null);
  const [colIndex, setColIndex] = useState<number>(0);
  const [parsing, setParsing] = useState(false);

  // 打开重置
  useEffect(() => {
    if (open) {
      setFile(null);
      setSheets([]);
      setSheet("");
      setRows([]);
      setHeaderRow(null);
      setColIndex(0);
      setParsing(false);
    }
  }, [open]);

  const colOptions = useMemo<SearchSelectOption[]>(
    () =>
      columnOptions(rows, headerRow).map((label, i) => ({ value: String(i), label })),
    [rows, headerRow],
  );

  async function handleFile(file: File) {
    setParsing(true);
    setFile(file);
    try {
      const info = await readWorkbook(file);
      setSheets(info.sheets);
      const first = info.sheets[0] ?? "";
      setSheet(first);
      if (first) {
        const r = info.rowsOf(first);
        setRows(r);
        setHeaderRow(detectHeaderRow(r));
        setColIndex(0);
      } else {
        setRows([]);
      }
    } catch (err) {
      toast.error(`文件读取失败:${err instanceof Error ? err.message : String(err)}`);
      setFile(null);
    } finally {
      setParsing(false);
    }
  }

  function handleSheetChange(v: string) {
    setSheet(v);
    if (!file) return;
    void (async () => {
      const info = await readWorkbook(file);
      const r = info.rowsOf(v);
      setRows(r);
      setHeaderRow(detectHeaderRow(r));
      setColIndex(0);
    })();
  }

  /** 预览前 5 行(按当前选择的列) */
  const preview = useMemo(() => {
    const from = headerRow != null ? headerRow + 1 : 0;
    return rows.slice(from, from + 5);
  }, [rows, headerRow]);

  function handleConfirm() {
    const addresses = extractAddresses(rows, headerRow, colIndex);
    if (addresses.length === 0) {
      toast.error("该列没有可用的地址数据");
      return;
    }
    onImport(addresses);
    toast.success(`已导入 ${addresses.length} 条地址`);
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onOpenChange(false);
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>导入地址(Excel / CSV)</DialogTitle>
          <DialogDescription>
            选择包含地址列的工作表;系统会自动识别表头行,也可手动指定地址列。
          </DialogDescription>
        </DialogHeader>

        {/* 文件选择 */}
        <label
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-6 text-center transition-colors hover:border-primary/40 hover:bg-muted/30"
        >
          <input
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
          <FileSpreadsheet className="size-8 text-muted-foreground/60" />
          <div className="text-[13px]">
            {file ? file.name : "点击选择 Excel / CSV 文件"}
          </div>
          {parsing && <Spinner size="sm" />}
        </label>

        {/* sheet 选择 + 地址列选择 */}
        {sheets.length > 1 && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-muted-foreground">工作表</span>
              <SearchSelect
                value={sheet || undefined}
                onValueChange={handleSheetChange}
                options={sheets.map((s) => ({ value: s, label: s }))}
                placeholder="选择 sheet"
                triggerClassName="min-w-36"
              />
            </div>
          </div>
        )}

        {rows.length > 0 && (
          <div className="flex flex-col gap-2">
            {sheets.length <= 1 && (
              <div className="text-[12px] text-muted-foreground">
                当前工作表数据 {rows.length} 行,「首行含表头」已自动检测
                {headerRow != null ? `(表头在第 ${headerRow + 1} 行)` : "(未检测到表头,第一行按数据)"}
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-muted-foreground">地址列</span>
              <SearchSelect
                value={String(colIndex)}
                onValueChange={(v) => setColIndex(Number(v))}
                options={colOptions}
                placeholder="选择地址列"
                triggerClassName="min-w-36"
              />
            </div>
            {/* 预览前 5 行 */}
            <div className="max-h-36 overflow-y-auto rounded-xl border border-border bg-muted/30 p-2">
              {preview.map((row, i) => (
                <div key={i} className="truncate px-1 py-0.5 text-[12px] text-muted-foreground">
                  {row[colIndex] ?? "(空)"}
                </div>
              ))}
              {preview.length === 0 && (
                <div className="px-1 py-1 text-[12px] text-muted-foreground/70">
                  该列暂无数据
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={rows.length === 0}>
            <Play className="size-3.5" />
            导入 {rows.length > 0 ? "" : ""}地址
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}