"use client";

import { memo, useMemo, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Layers, RefreshCw, Trash2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SearchSelect, type SearchSelectOption } from "@/components/ui/search-select";
import { TagInput } from "@/components/ui/tag-input";
import {
  type AddrSimAffix,
  type AddrSimRandomValue,
  type AddrSimSourceName,
  type AddrSimStep,
} from "@/lib/validators/addr-sim";
import {
  previewStepValues,
  type CandidatePool,
} from "@/lib/addr-sim/generator";
import { getSourceKind, type SourceKind } from "@/lib/addr-sim/step-source";
import { NumField } from "@/components/ui/num-field";
import { RateSlider } from "@/components/ui/rate-slider";

const SOURCE_TABLE_OPTIONS: SearchSelectOption<AddrSimSourceName>[] = [
  { value: "road", label: "道路(road)" },
  { value: "community", label: "小区(community)" },
  { value: "village", label: "村(village)" },
  { value: "poi", label: "兴趣点(poi)" },
];

const RANDOM_NUMBER_FORMATS: SearchSelectOption<"arabic" | "chinese">[] = [
  { value: "arabic", label: "阿拉伯数字" },
  { value: "chinese", label: "中文数字" },
];

/**
 * 步骤行:名称 + 数据来源三选一 + 前后缀 + 跳过率 + 单步预览。
 * 可拖拽(useSortable),点击删除按钮移除。
 */
function StepRowInner({
  id,
  index,
  step,
  labels,
  candidates,
  onChange,
  onRemove,
  onUpdateAll,
}: {
  id: string;
  index: number;
  step: AddrSimStep;
  /** 地址要素字典(label.label 中文名) */
  labels: Array<{ name: string; label: string }>;
  candidates: CandidatePool;
  onChange: (next: AddrSimStep) => void;
  onRemove: () => void;
  /**
   * "更新全局"按钮回调:把当前步骤配置同步到所有规则里同名 label 的步骤上。
   * 不传或 step.name 为空时,按钮禁用。
   */
  onUpdateAll?: (step: AddrSimStep) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const [showPreview, setShowPreview] = useState(false);
  const [previewTick, setPreviewTick] = useState(0);

  // 数据来源判定(纯函数,见 lib/addr-sim/step-source)
  const sourceKind: SourceKind = getSourceKind(step);

  const labelOptions = useMemo<SearchSelectOption[]>(
    () =>
      labels.map((l) => ({
        value: l.label,
        label: l.label,
      })),
    [labels],
  );

  function patch(p: Partial<AddrSimStep>) {
    onChange({ ...step, ...p });
  }

  function setSource(kind: SourceKind) {
    // 切换数据来源时只保留当前源,保证"四选一"恒成立
    if (kind === "randomValue") {
      const current: AddrSimRandomValue = step.randomValue ?? { name: "road" };
      patch({
        randomValue: current,
        customValue: undefined,
        randomNumber: undefined,
        randomChinese: undefined,
      });
    } else if (kind === "customValue") {
      patch({
        randomValue: undefined,
        customValue: step.customValue ?? { list: [] },
        randomNumber: undefined,
        randomChinese: undefined,
      });
    } else if (kind === "randomNumber") {
      patch({
        randomValue: undefined,
        customValue: undefined,
        randomNumber: step.randomNumber ?? {
          format: "arabic",
          minDigits: 1,
          maxDigits: 4,
        },
        randomChinese: undefined,
      });
    } else {
      patch({
        randomValue: undefined,
        customValue: undefined,
        randomNumber: undefined,
        randomChinese: step.randomChinese ?? { minLength: 2, maxLength: 4 },
      });
    }
  }

  function patchAffix(kind: "prefix" | "suffix", p: Partial<AddrSimAffix>) {
    const cur: AddrSimAffix = step[kind] ?? { texts: [], skipRate: 0 };
    // 空文本 + 0 跳过率时删掉该前后缀配置,保持存储整洁
    const next: AddrSimAffix = { ...cur, ...p };
    const hasTexts = (next.texts ?? []).some((t) => t.trim() !== "");
    if (!hasTexts && (next.skipRate ?? 0) === 0) {
      patch({ [kind]: undefined });
    } else {
      patch({ [kind]: next });
    }
  }

  // 单步预览:10 个样本,配置或刷新时重算
  const previewSamples = useMemo(() => {
    if (!showPreview) return [];
    return previewStepValues(step, 10, { rng: Math.random, candidates });
    // previewTick 用于手动刷新
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, showPreview, candidates, previewTick]);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group/step rounded-xl border border-border bg-card p-3",
        isDragging && "z-10 opacity-80 shadow-lg",
      )}
    >
      {/* 头部:序号 + 名称 + 操作 */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="cursor-grab touch-none text-muted-foreground/60 hover:text-foreground active:cursor-grabbing"
          aria-label={`拖动步骤 ${index + 1}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <span className="w-14 shrink-0 text-[11.5px] font-medium tabular-nums text-muted-foreground">
          步骤 {index + 1}
        </span>
        <SearchSelect
          value={step.name || undefined}
          onValueChange={(v) => patch({ name: v })}
          options={labelOptions}
          placeholder="选择地址要素…"
          triggerClassName="min-w-36"
        />
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => onUpdateAll?.(step)}
          disabled={!step.name}
          title={step.name ? `把所有规则中 "${step.name}" 步骤同步为当前配置` : "请先选择地址要素"}
          aria-label="更新全局同名步骤"
          className="flex size-7 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground/60"
        >
          <Layers className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label="删除步骤"
          className="flex size-7 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-danger-soft hover:text-danger"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {/* 数据来源四选一 */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <span className="text-[11.5px] text-muted-foreground">数据来源</span>
        {(
          [
            ["randomValue", "实体表"],
            ["customValue", "自定义列表"],
            ["randomNumber", "随机数字"],
            ["randomChinese", "随机中文"],
          ] as Array<[SourceKind, string]>
        ).map(([kind, label]) => (
          <button
            key={kind}
            type="button"
            onClick={() => setSource(kind)}
            className={cn(
              "rounded-lg border px-2.5 py-1 text-[12px] transition-colors",
              sourceKind === kind
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 来源配置区 */}
      <div className="mt-2.5 space-y-2">
        {sourceKind === "randomValue" && (
          <div className="flex flex-wrap items-center gap-2">
            <SearchSelect<AddrSimSourceName>
              value={step.randomValue?.name ?? "road"}
              onValueChange={(v) =>
                patch({
                  randomValue: { name: v },
                })
              }
              options={SOURCE_TABLE_OPTIONS}
              placeholder="候选表"
              triggerClassName="min-w-40"
            />
            <span className="text-[11px] text-muted-foreground">
              表内共 {(candidates[step.randomValue?.name ?? "road"]?.length ?? 0).toLocaleString()} 个候选值
            </span>
          </div>
        )}

        {sourceKind === "customValue" && (
          <div className="max-w-xl">
            <TagInput
              value={(step.customValue?.list ?? []).map((v) => ({ value: v }))}
              onChange={(entries) =>
                patch({
                  customValue: { list: entries.map((e) => e.value) },
                })
              }
              placeholder="输入候选值回车添加;支持 N->M 范围(如 1->9、一->二十)"
              max={Number.POSITIVE_INFINITY}
              enableCopy
            />
          </div>
        )}

        {sourceKind === "randomNumber" && (
          <div className="flex flex-wrap items-center gap-2">
            <SearchSelect<"arabic" | "chinese">
              value={step.randomNumber?.format ?? "arabic"}
              onValueChange={(v) =>
                patch({
                  randomNumber: {
                    format: v,
                    minDigits: step.randomNumber?.minDigits ?? 1,
                    maxDigits: step.randomNumber?.maxDigits ?? 4,
                  },
                })
              }
              options={RANDOM_NUMBER_FORMATS}
              placeholder="格式"
              triggerClassName="min-w-32"
            />
            <div className="flex items-center gap-1.5">
              <span className="text-[11.5px] text-muted-foreground">位数</span>
              <NumField
                value={(step.randomNumber?.minDigits ?? 1)}
                onChange={(minDigits) =>
                  patch({
                    randomNumber: {
                      format: step.randomNumber?.format ?? "arabic",
                      minDigits,
                      maxDigits: step.randomNumber?.maxDigits ?? 4,
                    },
                  })
                }
                min={1}
                max={9}
              />
              <span className="text-[11.5px] text-muted-foreground">至</span>
              <NumField
                value={(step.randomNumber?.maxDigits ?? 4)}
                onChange={(maxDigits) =>
                  patch({
                    randomNumber: {
                      format: step.randomNumber?.format ?? "arabic",
                      minDigits: step.randomNumber?.minDigits ?? 1,
                      maxDigits,
                    },
                  })
                }
                min={1}
                max={9}
              />
            </div>
          </div>
        )}

        {sourceKind === "randomChinese" && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[11.5px] text-muted-foreground">长度</span>
              <NumField
                value={(step.randomChinese?.minLength ?? 2)}
                onChange={(minLength) =>
                  patch({
                    randomChinese: {
                      minLength,
                      maxLength: step.randomChinese?.maxLength ?? 4,
                    },
                  })
                }
                min={1}
                max={20}
              />
              <span className="text-[11.5px] text-muted-foreground">至</span>
              <NumField
                value={(step.randomChinese?.maxLength ?? 4)}
                onChange={(maxLength) =>
                  patch({
                    randomChinese: {
                      minLength: step.randomChinese?.minLength ?? 2,
                      maxLength,
                    },
                  })
                }
                min={1}
                max={20}
              />
              <span className="text-[11.5px] text-muted-foreground">个汉字</span>
            </div>
          </div>
        )}
      </div>

      {/* 前后缀(多值 TagInput + 业务自己的跳过率)+ 整步跳过 */}
      <div className="mt-4.5 grid gap-6 md:grid-cols-2">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="block text-[11.5px] font-medium text-muted-foreground">
              前缀(多值)
            </span>
            <RateSlider
              className=""
              label="前缀跳过"
              value={step.prefix?.skipRate ?? 0}
              onChange={(v) => patchAffix("prefix", { skipRate: v })}
            />
          </div>

          <TagInput
            value={(step.prefix?.texts ?? []).map((v) => ({ value: v }))}
            onChange={(entries) =>
              patchAffix("prefix", { texts: entries.map((e) => e.value) })
            }
            max={Number.POSITIVE_INFINITY}
            placeholder="回车添加前缀,如：大"
            enableCopy
          />
        </div>

        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="block text-[11.5px] font-medium text-muted-foreground">
              后缀(多值)
            </span>
            <RateSlider
              className=""
              label="后缀跳过"
              value={step.suffix?.skipRate ?? 0}
              onChange={(v) => patchAffix("suffix", { skipRate: v })}
            />
          </div>

          <TagInput
            value={(step.suffix?.texts ?? []).map((v) => ({ value: v }))}
            onChange={(entries) =>
              patchAffix("suffix", { texts: entries.map((e) => e.value) })
            }
            max={Number.POSITIVE_INFINITY}
            placeholder="回车添加后缀,如：路"
            enableCopy
          />
        </div>
      </div>

      <div className="mt-2.5">
        <RateSlider
          value={step.skipRate}
          onChange={(skipRate) => patch({ skipRate: skipRate ?? 0 })}
          label="整步跳过"
        />
      </div>

      {/* 单步预览 */}
      <div className="mt-2.5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          className="text-[12px] text-primary hover:underline"
        >
          {showPreview ? "收起预览" : "预览 10 条样本"}
        </button>
        {showPreview && (
          <button
            type="button"
            onClick={() => setPreviewTick((t) => t + 1)}
            aria-label="重新抽样"
            title="重新抽样"
            className="flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="size-3" />
            重抽
          </button>
        )}
      </div>
      {showPreview && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {previewSamples.map((s, i) => (
            <span
              key={i}
              className={cn(
                "rounded-lg border px-2 py-0.5 text-[12px]",
                s === null
                  ? "border-dashed text-muted-foreground/50 line-through"
                  : "border-border bg-muted/40",
              )}
            >
              {s ?? "(跳过)"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** memo:只有 props 变化才重渲染(拖拽时避免整列重渲染) */
export const StepRow = memo(StepRowInner);

/** 空态提示(编辑区无步骤时) */
export function StepEmptyHint({
  onAdd,
}: {
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-8 text-center">
      <X className="size-4 text-muted-foreground/50" />
      <p className="text-[12.5px] text-muted-foreground">还没有步骤,点击下方按钮添加</p>
      <Button size="sm" variant="outline" onClick={onAdd}>
        添加步骤
      </Button>
    </div>
  );
}
