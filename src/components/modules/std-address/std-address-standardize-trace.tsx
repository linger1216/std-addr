"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { StdFields } from "@/lib/standardize/build";
import { mapFieldsToPersist } from "@/lib/standardize/persist";
import { STD_ADDRESS_FIELDS } from "./std-address-fields";

/** 标准化单步(与后端 StandardizeStep 对齐;前端本地定义,避免引入 server 模块)。
 * 只渲染 fields(非空要素 tag)/input/msg/output/status;status:ok|match|skip|error。
 * input/msg/output 为空时不渲染;status 为 skip 时不渲染 input/output。
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

/**
 * 计算每步相对「上一步」发生变更的字段 key(集合)。
 * 遍历顺序:顶层分组 → 子步骤(文档顺序),跨分组连续;只有带 fields 的子步骤
 * 参与对比,分组容器本身无快照。首步无前驱,其所有字段相对空快照均视为新增(全部高亮)。
 * 对比基于 mapFieldsToPersist 后的表列值(与 FieldTags 展示口径一致)。
 * 返回 step 对象 → 变更 key 集合,渲染时按对象引用查询。
 */
function buildChangedMap(
  trace: TraceStep[],
): Map<TraceStep, Set<string>> {
  const map = new Map<TraceStep, Set<string>>();
  let prev: Record<string, string | null> | null = null;
  const walk = (steps: TraceStep[]) => {
    for (const s of steps) {
      if (s.children && s.children.length > 0) {
        walk(s.children);
      } else if (s.fields) {
        const cur = mapFieldsToPersist(s.fields);
        const changed = new Set<string>();
        for (const key of Object.keys(cur)) {
          const v = cur[key];
          if (v != null && v.trim() !== "" && prev?.[key] !== v) {
            changed.add(key);
          }
        }
        map.set(s, changed);
        prev = cur;
      }
    }
  };
  walk(trace);
  return map;
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
  const changedMap = useMemo(() => buildChangedMap(trace ?? []), [trace]);

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
      <p className="text-[10.5px] text-muted-foreground">
        <span className="mr-1 inline-block h-2 w-2 rounded-sm border border-amber-500/60 bg-amber-500/10 align-middle" />
        带色标签 = 相对上一步发生变更的字段
      </p>
      <ol className="relative space-y-3 border-l border-border pl-4">
        {trace.map((s, i) => (
          <StepItem
            key={i}
            step={s}
            label={String(i + 1)}
            changedMap={changedMap}
          />
        ))}
      </ol>
    </div>
  );
}

/**
 * 单步渲染(递归支持两级)。
 * label 由遍历侧传入(顶层 1/2…;子步骤 父.子 如 1.1/1.2),不依赖后端 index。
 */
function StepItem({
  step,
  label,
  changedMap,
}: {
  step: TraceStep;
  label: string;
  changedMap?: Map<TraceStep, Set<string>>;
}) {
  const badge = STATUS_BADGE[step.status ?? "ok"];
  return (
    <li className="relative">
      <span
        className={cn(
          "absolute -left-5.25 top-1 size-2.5 rounded-full ring-2 ring-popover",
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
      <FieldTags fields={step.fields} changedKeys={changedMap?.get(step)} />

      {/* skip 状态不展示输入/输出(通常无实际处理) */}
      {step.status !== "skip" && (
        <div className="mt-1 space-y-1.5">
          {!isEmptyValue(step.input) && (
            <Kv label="输入" value={json(step.input)} />
          )}
          {!isEmptyValue(step.output) && (
            <Kv label="输出" value={json(step.output)} />
          )}
        </div>
      )}

      {/* 子步骤(二级):序号 = 父序号.子序号 */}
      {step.children && step.children.length > 0 && (
        <ol className="relative mt-2 space-y-2 border-l border-dashed border-border/70 pl-4">
          {step.children.map((child, idx) => (
            <StepItem
              key={idx}
              step={child}
              label={`${label}.${idx + 1}`}
              changedMap={changedMap}
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
function FieldTags({
  fields,
  changedKeys,
}: {
  fields?: StdFields;
  changedKeys?: Set<string>;
}) {
  if (!fields) return null;
  const mapped = mapFieldsToPersist(fields);
  const items = STD_ADDRESS_FIELDS.filter(([key]) => {
    const v = mapped[key];
    return typeof v === "string" && v.trim() !== "";
  });
  if (items.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {items.map(([key, label]) => {
        const changed = changedKeys?.has(key);
        return (
          <span
            key={key}
            className={cn(
              "inline-flex items-center gap-1 rounded border px-1.5 py-px text-[10.5px] leading-4",
              changed
                ? "border-amber-500/60 bg-amber-500/10"
                : "border-border/60 bg-secondary/30",
            )}
          >
            <span className="text-muted-foreground">{label}</span>
            <span
              className={cn(
                changed
                  ? "font-medium text-amber-700 dark:text-amber-300"
                  : "text-foreground/90",
              )}
            >
              {mapped[key]}
            </span>
          </span>
        );
      })}
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
