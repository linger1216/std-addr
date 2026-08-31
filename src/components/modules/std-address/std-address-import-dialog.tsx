"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  type WorkbookInfo,
} from "@/lib/addr-model/excel-io";

/**
 * 标准地址库 · 原始地址导入 Dialog(选列式,交互参考 addr-model):
 *  - 上传 Excel/CSV → 选择 sheet(多 sheet 时)→ 自动检测表头行 → 用户指定地址列
 *  - 完整预览:全部行逐条展示,可勾选要进入地址库的记录(默认全选)
 *  - 只导入地址字符串;标准地址与评分由列表「批量标准化」统一生成
 */
export function StdAddressImportDialog({
  open,
  onOpenChange,
  onImport,
  isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 导入选中的地址列表(原始地址,未去重) */
  onImport: (addresses: string[]) => void;
  isPending: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const workbookRef = useRef<WorkbookInfo | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [sheet, setSheet] = useState<string>("");
  const [rows, setRows] = useState<string[][]>([]);
  const [headerRow, setHeaderRow] = useState<number | null>(null);
  const [colIndex, setColIndex] = useState<number>(0);
  const [parsing, setParsing] = useState(false);
  /** 选中的行索引;null = 全选 */
  const [selected, setSelected] = useState<Set<number> | null>(null);

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
      setSelected(null);
      workbookRef.current = null;
    }
  }, [open]);

  const colOptions = useMemo<SearchSelectOption[]>(
    () =>
      columnOptions(rows, headerRow).map((label, i) => ({ value: String(i), label })),
    [rows, headerRow],
  );

  /** 当前列解析出的全部地址(顺序与预览行一致) */
  const addresses = useMemo(
    () => extractAddresses(rows, headerRow, colIndex),
    [rows, headerRow, colIndex],
  );

  const selectedCount = selected === null ? addresses.length : selected.size;

  function resetSelectionOnDataChange() {
    setSelected(null);
  }

  async function handleFile(f: File) {
    setParsing(true);
    setFile(f);
    try {
      const info = await readWorkbook(f);
      workbookRef.current = info;
      setSheets(info.sheets);
      const first = info.sheets[0] ?? "";
      setSheet(first);
      if (first) {
        const r = info.rowsOf(first);
        setRows(r);
        setHeaderRow(detectHeaderRow(r));
        setColIndex(0);
        resetSelectionOnDataChange();
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
    const info = workbookRef.current;
    if (!info) return;
    const r = info.rowsOf(v);
    setRows(r);
    setHeaderRow(detectHeaderRow(r));
    setColIndex(0);
    resetSelectionOnDataChange();
  }

  function toggleSelect(index: number) {
    setSelected((prev) => {
      const next = prev ? new Set(prev) : new Set(addresses.map((_, i) => i));
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    // 全选 = null;全不选 = 空集合
    setSelected(checked ? null : new Set<number>());
  }

  function handleConfirm() {
    const picked = addresses.filter((_, i) => selected === null || selected.has(i));
    if (picked.length === 0) {
      toast.error("请至少选择一条地址");
      return;
    }
    onImport(picked);
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
          <DialogTitle>导入原始地址(Excel / CSV)</DialogTitle>
          <DialogDescription>
            选择地址列后逐条预览,勾选要进入地址库的记录;导入后可勾选「批量标准化」生成标准地址。
          </DialogDescription>
        </DialogHeader>

        {/* 文件选择 */}
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-6 text-center transition-colors hover:border-primary/40 hover:bg-muted/30">
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
          <div className="text-[13px]">{file ? file.name : "点击选择 Excel / CSV 文件"}</div>
          {parsing && <Spinner size="sm" />}
        </label>

        {/* sheet 选择(仅多 sheet 时) */}
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
                onValueChange={(v) => {
                  setColIndex(Number(v));
                  resetSelectionOnDataChange();
                }}
                options={colOptions}
                placeholder="选择地址列"
                triggerClassName="min-w-36"
              />
            </div>

            {/* 完整预览 + 勾选(用户决定哪些进入地址库) */}
            {addresses.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-muted/30 p-2">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selected !== null && selected.size === 0 ? false : selectedCount === addresses.length}
                      indeterminate={selectedCount > 0 && selectedCount < addresses.length}
                      onCheckedChange={(v) => toggleAll(Boolean(v))}
                      aria-label="全选"
                    />
                    <span className="text-[12px] text-muted-foreground">
                      全选 · 已选 {selectedCount} / {addresses.length} 条
                    </span>
                  </div>
                  {selectedCount < addresses.length && (
                    <button
                      type="button"
                      onClick={() => toggleAll(true)}
                      className="text-[12px] text-primary hover:underline"
                    >
                      恢复全选
                    </button>
                  )}
                </div>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-card">
                  {addresses.map((addr, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 border-b border-border/40 px-2 py-1 last:border-b-0"
                    >
                      <Checkbox
                        checked={selected === null || selected.has(i)}
                        onCheckedChange={() => toggleSelect(i)}
                        aria-label={`选择第 ${i + 1} 条`}
                        className="mt-0.5 shrink-0"
                      />
                      <span className="w-7 shrink-0 text-right font-mono text-[11px] leading-5 text-muted-foreground">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 break-all text-[12.5px] leading-5 text-foreground">
                        {addr}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {addresses.length === 0 && (
              <div className="px-1 py-1 text-[12px] text-muted-foreground/70">
                该列暂无地址数据
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={selectedCount === 0 || isPending}>
            <Upload className="size-3.5" />
            {isPending ? "导入中…" : `导入 ${selectedCount} 条进入地址库`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}