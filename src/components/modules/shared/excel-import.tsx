"use client";

import { useRef, useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import * as XLSX from "xlsx";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toErrorMessage } from "@/lib/constants";

export type ImportResult = {
  created: number;
  errors: Array<{ index: number; message: string }>;
};

/** 导入字段配置:key 是行的字段名,label 是 Excel 列头 */
export type ImportField = {
  key: string;
  label: string;
  required?: boolean;
  width?: number;
};

/** 解析后的行:字段 key -> 字符串值(空串表示缺失) */
export type ImportRow = Record<string, string>;

type Parsed = {
  rows: ImportRow[];
  warnings: string[];
};

/** 解析 xlsx -> 字段配置映射的行 */
function parseWorkbook(buffer: ArrayBuffer, fields: ImportField[]): Parsed {
  const warnings: string[] = [];
  try {
    const wb = XLSX.read(buffer, { type: "array" });
    const first = wb.SheetNames[0];
    if (!first) return { rows: [], warnings: ["Excel 中没有工作表"] };
    const sheet = wb.Sheets[first];
    if (!sheet) return { rows: [], warnings: ["工作表中没有数据"] };
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
    });

    const labels = fields.map((f) => f.label);
    const rows: ImportRow[] = [];
    json.forEach((row, i) => {
      const out: ImportRow = {};
      let missingRequired = false;
      for (const f of fields) {
        // 同时支持中文列头(f.label)和英文 key(f.key)
        const raw = row[f.label] ?? row[f.key] ?? "";
        // 只接受标量值(string/number/boolean);对象(公式/富单元格)按空处理,
        // 避免 String(object) 落入 "[object Object]"
        const val =
          typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean"
            ? String(raw).trim()
            : "";
        out[f.key] = val;
        if (f.required && !val) {
          missingRequired = true;
        }
      }
      if (missingRequired) {
        warnings.push(
          `第 ${i + 2} 行: 缺少必填列「${labels.filter((l, fi) => fields[fi]?.required).join("/")}」,已跳过`,
        );
        return;
      }
      rows.push(out);
    });
    return { rows, warnings };
  } catch (err) {
    return {
      rows: [],
      warnings: [`Excel 解析失败: ${toErrorMessage(err)}`],
    };
  }
}

/**
 * 通用 Excel 导入对话框(仅支持 .xlsx/.xls)。
 * - 字段配置化:通过 fields 定义列头/必填/列宽
 * - 提供「下载模板」:自动生成含指定列头 + 空行的模板
 * - 解析后逐行调用 onSubmit(通常触发后端 import procedure)
 */
export function ExcelImportDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
  onSubmit,
  isPending,
  fileNamePrefix = "导入模板",
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  title: string;
  description?: string;
  fields: ImportField[];
  onSubmit: (rows: ImportRow[]) => Promise<ImportResult | undefined> | void;
  isPending: boolean;
  fileNamePrefix?: string;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  function reset() {
    setParsed(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFile(file: File) {
    if (
      !file.name.toLowerCase().endsWith(".xlsx") &&
      !file.name.toLowerCase().endsWith(".xls")
    ) {
      setParsed({ rows: [], warnings: ["仅支持 Excel 文件(.xlsx/.xls)"] });
      return;
    }
    const buffer = await file.arrayBuffer();
    setParsed(parseWorkbook(buffer, fields));
  }

  function downloadTemplate() {
    const header = fields.map((f) => f.label);
    const ws = XLSX.utils.aoa_to_sheet([header]);
    ws["!cols"] = fields.map((f) => ({ wch: f.width ?? 20 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "模板");
    XLSX.writeFile(wb, `${fileNamePrefix}.xlsx`);
  }

  async function handleImport() {
    if (!parsed || parsed.rows.length === 0) return;
    const r = await onSubmit(parsed.rows);
    if (r) setResult(r);
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
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ?? "仅支持 Excel(.xlsx/.xls)。可先下载模板填写后导入。"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="size-3.5" />
              选择 Excel 文件
            </Button>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="size-3.5" />
              下载模板
            </Button>
          </div>

          {parsed && (
            <div className="rounded-xl border border-border bg-secondary/40 p-3 text-xs">
              {parsed.warnings.length > 0 && (
                <ul className="mb-1.5 space-y-0.5 text-danger">
                  {parsed.warnings.map((w, i) => (
                    <li key={i}>⚠ {w}</li>
                  ))}
                </ul>
              )}
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <FileSpreadsheet className="size-4" />
                共解析 {parsed.rows.length} 行待导入
              </div>
            </div>
          )}

          {result && (
            <div className="rounded-xl bg-success-soft p-3 text-xs text-success-fg">
              已导入 {result.created} 条
              {result.errors.length > 0 && ` · 失败 ${result.errors.length} 条`}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={handleImport}
            disabled={!parsed || parsed.rows.length === 0 || isPending}
          >
            {isPending ? "导入中…" : "导入"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}