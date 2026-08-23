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

type Parsed = {
  rows: Array<{
    name: string;
    alias?: string;
    regionId?: string;
    status?: number;
  }>;
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

function parseCsv(text: string): Parsed {
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
  const idx = {
    name: header.indexOf("name"),
    alias: header.indexOf("alias"),
    regionId: header.indexOf("regionid"),
    status: header.indexOf("status"),
  };
  if (idx.name < 0) {
    warnings.push("缺少必需列 name");
    return { rows: [], warnings };
  }
  const rows: Parsed["rows"] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]!);
    const get = (k: keyof typeof idx): string => {
      const i = idx[k];
      if (i < 0 || i >= cells.length) return "";
      return cells[i] ?? "";
    };
    const name = get("name");
    if (!name) {
      warnings.push(`第 ${i + 1} 行: 缺少 name,已跳过`);
      continue;
    }
    const statusRaw = get("status");
    const statusNum = statusRaw ? Number(statusRaw) : NaN;
    const alias = get("alias");
    const regionId = get("regionId");
    rows.push({
      name,
      alias: alias ?? undefined,
      regionId: regionId ?? undefined,
      status: Number.isFinite(statusNum) ? statusNum : undefined,
    });
  }
  return { rows, warnings };
}

function parseJsonInput(text: string): Parsed {
  try {
    const data: unknown = JSON.parse(text);
    if (!Array.isArray(data)) {
      return { rows: [], warnings: ["JSON 内容必须是数组"] };
    }
    const dataArr: unknown[] = data;
    const rows: Parsed["rows"] = [];
    const warnings: string[] = [];
    for (let i = 0; i < dataArr.length; i++) {
      const item: unknown = dataArr[i];
      if (!item || typeof item !== "object") {
        warnings.push(`第 ${i + 1} 项不是对象,已跳过`);
        continue;
      }
      const obj = item as Record<string, unknown>;
      const name = typeof obj.name === "string" ? obj.name : "";
      if (!name) {
        warnings.push(`第 ${i + 1} 项缺少 name,已跳过`);
        continue;
      }
      rows.push({
        name,
        alias: typeof obj.alias === "string" ? obj.alias : undefined,
        regionId:
          typeof obj.regionId === "string" ? obj.regionId : undefined,
        status:
          typeof obj.status === "number" ? obj.status : undefined,
      });
    }
    return { rows, warnings };
  } catch (err) {
    return {
      rows: [],
      warnings: [`JSON 解析失败: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}

export function CsvImportDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onSubmit: (
    rows: Parsed["rows"],
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
      setParsed(parseCsv(text));
    } else {
      setParsed(parseJsonInput(text));
    }
  }

  async function handleFile(file: File) {
    const content = await file.text();
    setText(content);
    if (file.name.toLowerCase().endsWith(".json")) {
      setTab("json");
      setParsed(parseJsonInput(content));
    } else {
      setTab("csv");
      setParsed(parseCsv(content));
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
          <DialogTitle>导入小区</DialogTitle>
          <DialogDescription>
            支持 CSV(header: name,alias,regionId,status)或 JSON 数组。
          </DialogDescription>
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

          {tab === "csv" ? (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`name,alias,regionId,status\n阳光花园,sunny,,1`}
              className="min-h-32 w-full rounded-lg border border-input bg-background p-2 font-mono text-[12px] focus:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
            />
          ) : (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`[{"name":"阳光花园","alias":"sunny","status":1}]`}
              className="min-h-32 w-full rounded-lg border border-input bg-background p-2 font-mono text-[12px] focus:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
            />
          )}

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
                    <th className="px-2 py-1.5 font-normal">name</th>
                    <th className="px-2 py-1.5 font-normal">alias</th>
                    <th className="px-2 py-1.5 font-normal">regionId</th>
                    <th className="px-2 py-1.5 font-normal">status</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-t border-border/60">
                      <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                      <td className="px-2 py-1">{r.name}</td>
                      <td className="px-2 py-1">{r.alias ?? ""}</td>
                      <td className="px-2 py-1">{r.regionId ?? ""}</td>
                      <td className="px-2 py-1">{r.status ?? ""}</td>
                    </tr>
                  ))}
                  {parsed.rows.length > 50 && (
                    <tr>
                      <td
                        colSpan={5}
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
