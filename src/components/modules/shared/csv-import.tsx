"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type ImportResult = {
  created: number;
  errors: Array<{ index: number; message: string }>;
};

export type ImportField = {
  key: string;
  label: string;
  required?: boolean;
};

/** 解析后的行:字段 key -> 字符串值(空串表示缺失) */
export type ImportRow = Record<string, string>;

type Parsed = {
  rows: ImportRow[];
  warnings: string[];
};

/** 把单行 CSV 解析为字段数组(支持双引号转义) */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === ",") {
        out.push(cur);
        cur = "";
      } else if (ch === '"') {
        inQuote = true;
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseCsv(text: string, fields: ImportField[]): Parsed {
  const warnings: string[] = [];
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { rows: [], warnings: ["空文件"] };
  }
  const header = parseCsvLine(lines[0]!).map((h) => h.toLowerCase());
  const colIndex = new Map<string, number>();
  for (const f of fields) {
    const i = header.indexOf(f.key.toLowerCase());
    if (i >= 0) colIndex.set(f.key, i);
    else if (f.required) warnings.push(`缺少必需列 ${f.key}`);
  }

  const rows: ImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]!);
    const row: ImportRow = {};
    let skip = false;
    for (const f of fields) {
      const ci = colIndex.get(f.key);
      const val =
        ci !== undefined && ci < cells.length ? (cells[ci] ?? "") : "";
      if (f.required && !val) {
        warnings.push(`第 ${i + 1} 行: 缺少 ${f.label},已跳过`);
        skip = true;
        break;
      }
      row[f.key] = val;
    }
    if (!skip) rows.push(row);
  }
  return { rows, warnings };
}

function parseJsonInput(text: string, fields: ImportField[]): Parsed {
  try {
    const data: unknown = JSON.parse(text);
    return buildRowsFromJson(data, fields);
  } catch (err) {
    return {
      rows: [],
      warnings: [
        `JSON 解析失败: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }
}

function buildRowsFromJson(data: unknown, fields: ImportField[]): Parsed {
  if (!Array.isArray(data)) {
    return { rows: [], warnings: ["JSON 内容必须是数组"] };
  }
  const dataArr: unknown[] = data;
  const warnings: string[] = [];
  const rows: ImportRow[] = [];
  for (let i = 0; i < dataArr.length; i++) {
    const item = dataArr[i];
    if (!item || typeof item !== "object") {
      warnings.push(`第 ${i + 1} 项不是对象,已跳过`);
      continue;
    }
    const obj = item as Record<string, unknown>;
    const row: ImportRow = {};
    let skip = false;
    for (const f of fields) {
      const raw = obj[f.key];
      let val: string;
      if (raw === undefined || raw === null) {
        val = "";
      } else if (typeof raw === "string") {
        val = raw;
      } else if (typeof raw === "number" || typeof raw === "boolean") {
        val = String(raw);
      } else {
        try {
          val = JSON.stringify(raw);
        } catch {
          val = "";
        }
      }
      if (f.required && !val) {
        warnings.push(`第 ${i + 1} 项缺少 ${f.label},已跳过`);
        skip = true;
        break;
      }
      row[f.key] = val;
    }
    if (!skip) rows.push(row);
  }
  return { rows, warnings };
}

export function CsvImportDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  title: string;
  description: string;
  fields: ImportField[];
  onSubmit: (
    rows: ImportRow[],
  ) => Promise<ImportResult | undefined> | void;
  isPending: boolean;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [tab, setTab] = useState<"csv" | "json">("csv");
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  function reset() {
    setText("");
    setParsed(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleParse() {
    setResult(null);
    if (tab === "csv") {
      setParsed(parseCsv(text, fields));
    } else {
      setParsed(parseJsonInput(text, fields));
    }
  }

  async function handleFile(file: File) {
    const content = await file.text();
    setText(content);
    if (file.name.toLowerCase().endsWith(".json")) {
      setTab("json");
      setParsed(parseJsonInput(content, fields));
    } else {
      setTab("csv");
      setParsed(parseCsv(content, fields));
    }
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
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.json,.txt,application/json,text/csv,text/plain"
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
              选择文件
            </Button>
            <span className="text-[12px] text-muted-foreground">
              或在下方手动粘贴文本
            </span>
          </div>

          <div className="inline-flex items-center gap-1 rounded-xl bg-secondary/60 p-1">
            {(["csv", "json"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={cn(
                  "rounded-lg px-3 py-1 text-[12.5px] font-medium transition-colors",
                  tab === k
                    ? "bg-background text-foreground shadow-[0_1px_2px_rgba(0,0,0,.06)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {k.toUpperCase()}
              </button>
            ))}
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={[
              fields.map((f) => f.key).join(","),
              fields.map((f) => `示例${f.key}`).join(","),
            ].join("\n")}
            className="min-h-32 w-full rounded-lg border border-input bg-background p-2 font-mono text-[12px] focus:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
          />

          <div className="flex items-center justify-between">
            <Label className="text-[12px] text-muted-foreground">
              {parsed
                ? `解析得到 ${parsed.rows.length} 条 · 警告 ${parsed.warnings.length}`
                : "尚未解析"}
            </Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleParse}
              disabled={!text.trim()}
            >
              解析预览
            </Button>
          </div>

          {parsed?.warnings && parsed.warnings.length > 0 && (
            <ul className="max-h-24 space-y-0.5 overflow-auto rounded-lg bg-warn-soft p-2 text-[11.5px] text-warn-fg">
              {parsed.warnings.map((w, i) => (
                <li key={i}>· {w}</li>
              ))}
            </ul>
          )}

          {parsed && parsed.rows.length > 0 && (
            <div className="max-h-40 overflow-auto rounded-lg border border-border">
              <table className="w-full text-[12px]">
                <thead className="bg-secondary/60">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-2 py-1.5 font-normal">#</th>
                    {fields.map((f) => (
                      <th key={f.key} className="px-2 py-1.5 font-normal">
                        {f.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-t border-border/60">
                      <td className="px-2 py-1 text-muted-foreground">
                        {i + 1}
                      </td>
                      {fields.map((f) => (
                        <td key={f.key} className="px-2 py-1">
                          {r[f.key] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {parsed.rows.length > 50 && (
                    <tr>
                      <td
                        colSpan={fields.length + 1}
                        className="px-2 py-1 text-center text-muted-foreground"
                      >
                        仅展示前 50 行,共 {parsed.rows.length} 条
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {result && (
            <div
              className={
                result.errors.length > 0
                  ? "rounded-lg bg-warn-soft p-3 text-[12px] text-warn-fg"
                  : "rounded-lg bg-success-soft p-3 text-[12px] text-success-fg"
              }
            >
              成功 {result.created} 条 · 失败 {result.errors.length} 条
              {result.errors.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {result.errors.slice(0, 5).map((e, i) => (
                    <li key={i}>
                      · 第 {e.index + 1} 行: {e.message}
                    </li>
                  ))}
                  {result.errors.length > 5 && (
                    <li>· …还有 {result.errors.length - 5} 条错误</li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button
            onClick={handleImport}
            disabled={!parsed || parsed.rows.length === 0 || isPending}
          >
            {isPending ? "导入中…" : `导入 ${parsed?.rows.length ?? 0} 条`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}