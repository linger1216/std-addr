"use client";

import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { StdFields } from "@/lib/standardize/build";
import { mapFieldsToPersist } from "@/lib/standardize/persist";
import { STD_ADDRESS_FIELDS } from "./std-address-fields";

/** 标准化单步(与后端 StandardizeStep 对齐;前端本地定义,避免引入 server 模块)。
 * 只渲染 fields(非空要素 tag)/input/msg/output/status;status:ok|match|skip|error。
 * input/msg/output 为空时不渲染。
 * 不存 index:两层数组顺序 push,渲染时用下标自动编号(顶层 1/2…,子步骤 父.子)。 */
export interface TraceStep {
  name: string;
  children?: TraceStep[];
  /** 本步执行后的完整要素快照(StdFields);只展示非空 tag */
  fields?: StdFields;
  input?: unknown;
  output?: unknown;
  /** 过程说明文本(纯字符串,格式由调用方负责) */
  msg?: string;
  status?: "ok" | "match" | "skip" | "error";
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

/** 空值判定:undefined/null/空串/空数组/空对象 都视为空,前端不渲染 */
function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v).length === 0;
  return false;
}

const STATUS_DOT: Record<string, string> = {
  ok: "bg-success",
  match: "bg-primary",
  skip: "bg-muted-foreground/40",
  error: "bg-danger",
};

/** status → 徽标文案(ok 默认不显示徽标) */
const STATUS_BADGE: Record<string, { label: string; className?: string }> = {
  match: { label: "命中" },
  skip: { label: "跳过" },
  error: { label: "失败", className: "border-danger/50 text-danger" },
};

export function StdAddressStandardizeTrace({
  trace,
  loading,
  error,
}: {
  trace?: TraceStep[];
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
        {trace.map((s, i) => (
          <StepItem key={i} step={s} label={String(i + 1)} />
        ))}
      </ol>
    </div>
  );
}

/**
 * 单步渲染(递归支持两级)。
 * label 由遍历侧传入(顶层 1/2…;子步骤 父.子 如 1.1/1.2),不依赖后端 index。
 */
function StepItem({ step, label }: { step: TraceStep; label: string }) {
  const badge = STATUS_BADGE[step.status ?? "ok"];
  return (
    <li className="relative">
      <span
        className={cn(
          "absolute -left-[21px] top-1 size-2.5 rounded-full ring-2 ring-popover",
          STATUS_DOT[step.status ?? "ok"],
        )}
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-normal text-muted-foreground tabular-nums">
          {label}
        </span>
        <span className="text-[12.5px] font-medium">{step.name}</span>
        {badge && (
          <Badge
            variant="outline"
            className={cn("text-[10px]", badge.className)}
          >
            {badge.label}
          </Badge>
        )}
      </div>
      {!isEmptyValue(step.msg) && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{step.msg}</p>
      )}

      {/* 本步执行后的要素(始终展示非空 tag;字段全空则整块隐藏) */}
      <FieldTags fields={step.fields} />

      <div className="mt-1 space-y-1.5">
        {!isEmptyValue(step.input) && <Kv label="输入" value={json(step.input)} />}
        {!isEmptyValue(step.output) && (
          <Kv label="输出" value={json(step.output)} />
        )}
      </div>

      {/* 子步骤(二级):序号 = 父序号.子序号 */}
      {step.children && step.children.length > 0 && (
        <ol className="relative mt-2 space-y-2 border-l border-dashed border-border/70 pl-4">
          {step.children.map((child, idx) => (
            <StepItem
              key={idx}
              step={child}
              label={`${label}.${idx + 1}`}
            />
          ))}
        </ol>
      )}
    </li>
  );
}

/**
 * 步骤执行后的要素 tag 列表。
 * StdFields 是 NER 原生 key(road_number/sub_lane/group),先 mapFieldsToPersist
 * 归一为表列 key,再按 STD_ADDRESS_FIELDS 顺序与中文标签渲染;只显示非空值。
 */
function FieldTags({ fields }: { fields?: StdFields }) {
  if (!fields) return null;
  const mapped = mapFieldsToPersist(fields);
  const items = STD_ADDRESS_FIELDS.filter(([key]) => {
    const v = mapped[key];
    return typeof v === "string" && v.trim() !== "";
  });
  if (items.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {items.map(([key, label]) => (
        <span
          key={key}
          className="inline-flex items-center gap-1 rounded border border-border/60 bg-secondary/30 px-1.5 py-px text-[10.5px] leading-4"
        >
          <span className="text-muted-foreground">{label}</span>
          <span className="text-foreground/90">{mapped[key]}</span>
        </span>
      ))}
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
