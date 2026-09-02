"use client";

import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/** 标准化单步(与后端 StandardizeStep 对齐;前端本地定义,避免引入 server 模块) */
export interface TraceStep {
  index: number;
  name: string;
  input?: unknown;
  output?: unknown;
  matched?: unknown;
  note?: string;
  status?: "ok" | "skip" | "fail";
}

function json(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v || "—";
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return "[unserializable]";
  }
}

const STATUS_DOT: Record<string, string> = {
  ok: "bg-success",
  skip: "bg-muted-foreground/40",
  fail: "bg-danger",
};

export function StdAddressStandardizeTrace({
  trace,
  log,
  loading,
  error,
}: {
  trace?: TraceStep[];
  log?: string[];
  loading?: boolean;
  error?: string;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
        <Spinner size="sm" />
        正在运行标准化流水线…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-[12px] text-danger">
        标准化失败:{error}
      </div>
    );
  }
  if (!trace || trace.length === 0) {
    return (
      <p className="text-[12px] text-muted-foreground">
        暂无流程数据(点击「查看标准化流程」运行)
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <ol className="relative space-y-3 border-l border-border pl-4">
        {trace.map((s) => (
          <li key={s.index} className="relative">
            <span
              className={cn(
                "absolute -left-[21px] top-1 size-2.5 rounded-full ring-2 ring-popover",
                STATUS_DOT[s.status ?? "ok"],
              )}
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] font-medium">{s.name}</span>
              {s.status === "skip" && (
                <Badge variant="outline" className="text-[10px]">
                  跳过
                </Badge>
              )}
              {s.status === "fail" && (
                <Badge
                  variant="outline"
                  className="border-danger/50 text-[10px] text-danger"
                >
                  失败
                </Badge>
              )}
            </div>
            {s.note && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">{s.note}</p>
            )}

            <div className="mt-1 space-y-1.5">
              {s.input !== undefined && <Kv label="输入" value={json(s.input)} />}
              {s.output !== undefined && (
                <Kv label="输出" value={json(s.output)} />
              )}
              {s.matched !== undefined && (
                <div>
                  <span className="text-[10.5px] text-muted-foreground">命中</span>
                  <pre className="mt-0.5 max-h-40 overflow-auto rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-[10.5px] leading-relaxed text-foreground/90">
                    {json(s.matched)}
                  </pre>
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>

      {log && log.length > 0 && (
        <details className="rounded-lg border border-border bg-muted/30">
          <summary className="cursor-pointer px-3 py-1.5 text-[11.5px] text-muted-foreground">
            原始日志
          </summary>
          <pre className="max-h-60 overflow-auto px-3 pb-3 text-[10.5px] leading-relaxed text-muted-foreground">
            {log.join("\n\n")}
          </pre>
        </details>
      )}
    </div>
  );
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[10.5px] text-muted-foreground">{label}</span>
      <pre className="mt-0.5 max-h-40 overflow-auto rounded-md bg-muted/40 px-2 py-1 text-[10.5px] leading-relaxed text-foreground/90">
        {value}
      </pre>
    </div>
  );
}
