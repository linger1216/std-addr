"use client";

import { memo, useMemo, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Layers, Pencil, RefreshCw, Trash2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SearchSelect, type SearchSelectOption } from "@/components/ui/search-select";
import { TagInput } from "@/components/ui/tag-input";
import {
  type AddrSimAffix,
  type AddrSimCustomValue,
  type AddrSimLabel,
  type AddrSimLabelData,
  type AddrSimRandomChinese,
  type AddrSimRandomNumber,
  type AddrSimRandomValue,
  type AddrSimSourceName,
  type AddrSimStep,
  DEFAULT_NOISE_RATE,
  DEFAULT_SKIP_RATE,
} from "@/lib/validators/addr-sim";
import {
  previewStepValues,
  type CandidatePool,
} from "@/lib/addr-sim/generator";
import { resolveStepWithLabel } from "@/lib/addr-sim/resolve-step";
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

type SourceKey = "randomValue" | "customValue" | "randomNumber" | "randomChinese";

const SOURCE_TOGGLES: Array<{ key: SourceKey; label: string; hint: string }> = [
  { key: "randomValue", label: "实体表", hint: "从 road/community/village/poi 抽 1" },
  { key: "customValue", label: "自定义列表", hint: "从用户输入的候选值抽 1" },
  { key: "randomNumber", label: "随机数字", hint: "随机生成数字(arabic/chinese)" },
  { key: "randomChinese", label: "随机中文", hint: "从真实命名词典抽汉字" },
];

/** 单个数据源的配置编辑器(disabled = 继承要素默认,只读;onRemove 提供时显示「移除」) */
function SourceConfigPanel({
  source,
  value,
  disabled = false,
  onChange,
  onRemove,
  candidates,
}: {
  source: SourceKey;
  value: NonNullable<AddrSimLabelData[SourceKey]>;
  disabled?: boolean;
  onChange: (v: NonNullable<AddrSimLabelData[SourceKey]>) => void;
  onRemove?: () => void;
  candidates: CandidatePool;
}) {
  const removeBtn = !disabled && onRemove ? (
    <button
      type="button"
      onClick={onRemove}
      title={`移除该数据源(恢复继承要素默认)`}
      className="text-[11px] text-muted-foreground hover:text-danger"
    >
      移除
    </button>
  ) : null;

  switch (source) {
    case "randomValue": {
      const v = value as AddrSimRandomValue;
      return (
        <div className="flex flex-wrap items-center gap-2">
          <SearchSelect<AddrSimSourceName>
            value={v.name}
            onValueChange={(name) => onChange({ name })}
            options={SOURCE_TABLE_OPTIONS}
            placeholder="候选表"
            triggerClassName="min-w-40"
            disabled={disabled}
          />
          <span className="text-[11px] text-muted-foreground">
            表内 {(candidates[v.name]?.length ?? 0).toLocaleString()} 个候选值
          </span>
          {removeBtn}
        </div>
      );
    }
    case "customValue": {
      const v = value as AddrSimCustomValue;
      return (
        <div className="max-w-xl">
          <TagInput
            value={v.list.map((x) => ({ value: x }))}
            onChange={(entries) => onChange({ list: entries.map((e) => e.value) })}
            placeholder="输入候选值回车添加;支持 N->M 范围(如 1->9、一->二十)"
            max={Number.POSITIVE_INFINITY}
            enableCopy={!disabled}
            disabled={disabled}
          />
          {removeBtn}
        </div>
      );
    }
    case "randomNumber": {
      const v = value as AddrSimRandomNumber;
      return (
        <div className="flex flex-wrap items-center gap-2">
          <SearchSelect<"arabic" | "chinese">
            value={v.format}
            onValueChange={(format) => onChange({ ...v, format })}
            options={RANDOM_NUMBER_FORMATS}
            placeholder="格式"
            triggerClassName="min-w-32"
            disabled={disabled}
          />
          <div className="flex items-center gap-1.5">
            <span className="text-[11.5px] text-muted-foreground">位数</span>
            <NumField
              value={v.minDigits}
              onChange={(minDigits) => onChange({ ...v, minDigits })}
              min={1}
              max={9}
              disabled={disabled}
            />
            <span className="text-[11.5px] text-muted-foreground">至</span>
            <NumField
              value={v.maxDigits}
              onChange={(maxDigits) => onChange({ ...v, maxDigits })}
              min={1}
              max={9}
              disabled={disabled}
            />
          </div>
          {removeBtn}
        </div>
      );
    }
    case "randomChinese": {
      const v = value as AddrSimRandomChinese;
      return (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[11.5px] text-muted-foreground">长度</span>
            <NumField
              value={v.minLength}
              onChange={(minLength) => onChange({ ...v, minLength })}
              min={1}
              max={20}
              disabled={disabled}
            />
            <span className="text-[11.5px] text-muted-foreground">至</span>
            <NumField
              value={v.maxLength}
              onChange={(maxLength) => onChange({ ...v, maxLength })}
              min={1}
              max={20}
              disabled={disabled}
            />
            <span className="text-[11.5px] text-muted-foreground">个汉字</span>
          </div>
          {removeBtn}
        </div>
      );
    }
  }
}

/**
 * 步骤行(P0-6 重构):
 *  - 4 个数据源 randomValue/customValue/randomNumber/randomChinese 各自 toggle,任意组合叠加
 *  - 每个数据源配置仅在该 toggle 激活时展示
 *  - step.data 为空时,展示"使用 label 默认"提示,生成时由 resolver 补全
 *  - prefix/suffix 独立,各自独立 skipRate
 *
 * 注意:UI 编辑 step.data 是 override 层;最终生效值由 resolver 与 label.data 合并决定。
 */
function StepRowInner({
  id,
  index,
  step,
  labels,
  candidates,
  onChange,
  onRemove,
  onSaveToElement,
}: {
  id: string;
  index: number;
  step: AddrSimStep;
  /** 地址要素字典(label.name → 默认配置) */
  labels: AddrSimLabel[];
  candidates: CandidatePool;
  onChange: (next: AddrSimStep) => void;
  onRemove: () => void;
  /**
   * "保存到要素"按钮回调:把当前步骤配置写回地址要素默认。
   */
  onSaveToElement?: (step: AddrSimStep) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const [showPreview, setShowPreview] = useState(false);
  const [previewTick, setPreviewTick] = useState(0);
  /** 数据源配置面板的展开/收起(默认全部展开) */
  const [collapsed, setCollapsed] = useState<Partial<Record<SourceKey, boolean>>>({});

  const labelOptions = useMemo<SearchSelectOption[]>(
    () => labels.map((l) => ({ value: l.name, label: l.label ?? l.name })),
    [labels],
  );

  // 当前 step 的 label(找默认配置)
  const currentLabel = useMemo(
    () => labels.find((l) => l.name === step.name) ?? null,
    [labels, step.name],
  );

  function patch(p: Partial<AddrSimStep>) {
    onChange({ ...step, ...p });
  }

  /** 数据源视图开关:只展开/收起配置展示,不修改数据(修改只能通过「自定义配置」) */
  function toggleSourceView(key: SourceKey) {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  }

  /** 修改某个数据源的具体配置 */
  function patchSource<K extends SourceKey>(key: K, value: NonNullable<AddrSimLabelData[K]>) {
    patch({ data: { ...(step.data ?? {}), [key]: value } });
  }

  /** 移除某个自定义数据源(恢复为继承要素默认/未启用) */
  function removeSource(key: SourceKey) {
    const next = { ...(step.data ?? {}) };
    delete next[key];
    const allEmpty =
      !next.randomValue && !next.customValue && !next.randomNumber && !next.randomChinese;
    patch({ data: allEmpty ? undefined : next });
  }

  const data = step.data ?? {};

  /** 是否有任何步骤级自定义(数据源/前后缀/整体跳过/干扰) */
  const hasAnyOverride =
    step.data !== undefined ||
    step.prefix !== undefined ||
    step.suffix !== undefined ||
    step.skipRate !== undefined ||
    step.noiseRate !== undefined;
  /** 是否「继承要素默认」模式:已选要素且完全没自定义 → 全部字段只读 */
  const isInherited = !hasAnyOverride && Boolean(currentLabel);

  const labelHasSources =
    Boolean(currentLabel?.data) &&
    (currentLabel?.data?.randomValue !== undefined ||
      currentLabel?.data?.customValue !== undefined ||
      currentLabel?.data?.randomNumber !== undefined ||
      currentLabel?.data?.randomChinese !== undefined);

  // 数据源视图:继承模式只展示要素源(只读);自定义模式只展示步骤 override(可编辑)
  const sourceStates = SOURCE_TOGGLES.map(({ key }) => {
    const override = data[key] !== undefined;
    const inherited = isInherited && currentLabel?.data?.[key] !== undefined;
    return { key, override, inherited, active: override || inherited };
  });
  const activeKeys = sourceStates.filter((s) => s.active).length;

  /** 展示用的前后缀/跳过率/干扰率(继承模式取要素默认,自定义模式取步骤) */
  const viewPrefix = step.prefix ?? currentLabel?.prefix;
  const viewSuffix = step.suffix ?? currentLabel?.suffix;
  const viewSkipRate = step.skipRate ?? currentLabel?.skipRate ?? DEFAULT_SKIP_RATE;
  const viewNoiseRate = step.noiseRate ?? currentLabel?.noiseRate ?? DEFAULT_NOISE_RATE;

  /** 「自定义配置」:把要素默认整体 copy 到本步骤 → 转为可编辑 */
  function copyFromElement() {
    const ld = currentLabel;
    if (!ld) return;
    const next: Partial<AddrSimStep> = {};
    if (ld.data) {
      const sources: AddrSimLabelData = {};
      if (ld.data.randomValue) sources.randomValue = { ...ld.data.randomValue };
      if (ld.data.customValue)
        sources.customValue = { ...ld.data.customValue, list: [...ld.data.customValue.list] };
      if (ld.data.randomNumber) sources.randomNumber = { ...ld.data.randomNumber };
      if (ld.data.randomChinese) sources.randomChinese = { ...ld.data.randomChinese };
      if (Object.keys(sources).length > 0) next.data = sources;
    }
    if (ld.prefix) next.prefix = { ...ld.prefix, texts: [...(ld.prefix.texts ?? [])] };
    if (ld.suffix) next.suffix = { ...ld.suffix, texts: [...(ld.suffix.texts ?? [])] };
    if (typeof ld.skipRate === "number") next.skipRate = ld.skipRate;
    if (typeof ld.noiseRate === "number") next.noiseRate = ld.noiseRate;
    if (Object.keys(next).length > 0) patch(next);
  }

  /** 恢复为完全继承要素默认:清掉本步骤全部 override */
  function restoreFromElement() {
    patch({
      data: undefined,
      prefix: undefined,
      suffix: undefined,
      skipRate: undefined,
      noiseRate: undefined,
    });
  }

  function patchAffix(kind: "prefix" | "suffix", p: Partial<AddrSimAffix>) {
    const cur: AddrSimAffix = step[kind] ?? { texts: [], skipRate: 0 };
    const next: AddrSimAffix = { ...cur, ...p };
    const hasTexts = (next.texts ?? []).some((t) => t.trim() !== "");
    if (!hasTexts && (next.skipRate ?? 0) === 0) {
      patch({ [kind]: undefined });
    } else {
      patch({ [kind]: next });
    }
  }

  // 预览时用 resolver 把 label 默认合进来,模拟真实生效结果
  const resolved = useMemo(
    () => resolveStepWithLabel(step, currentLabel),
    [step, currentLabel],
  );

  const previewSamples = useMemo(() => {
    if (!showPreview) return [];
    return previewStepValues(resolved, 10, {
      rng: Math.random,
      candidates,
      realNames: Object.values(candidates).flat(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, showPreview, candidates, previewTick]);

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
        {isInherited && (
          <button
            type="button"
            onClick={copyFromElement}
            title="把地址要素默认配置复制到本步骤并转为可编辑,之后修改仅保存在本规则"
            className="flex items-center gap-1 rounded-lg border border-primary/30 px-2 py-1 text-[11.5px] text-primary transition-colors hover:bg-primary/10"
          >
            <Pencil className="size-3" />
            自定义配置
          </button>
        )}
        {hasAnyOverride && currentLabel && (
          <button
            type="button"
            onClick={restoreFromElement}
            title="清除本步骤自定义配置,恢复为直接使用地址要素默认"
            className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11.5px] text-muted-foreground transition-colors hover:border-danger/40 hover:text-danger"
          >
            恢复要素默认
          </button>
        )}
        <button
          type="button"
          onClick={() => onSaveToElement?.(step)}
          disabled={!step.name}
          title={step.name ? `把当前步骤配置保存为地址要素「${step.name}」的默认配置` : "请先选择地址要素"}
          aria-label="保存到地址要素"
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

      {/* 未选择要素时不显示任何配置;选择后才展示数据来源/前后缀/跳过率/干扰等 */}
      {step.name && (
        <>
      {/* 数据来源:4 个 toggle(视图开关,只展开/收起配置,不修改数据;自定义需点「自定义配置」) */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <span className="text-[11.5px] text-muted-foreground">数据来源</span>
        {SOURCE_TOGGLES.map(({ key, label, hint }) => {
          const s = sourceStates.find((x) => x.key === key)!;
          const isCollapsed = Boolean(collapsed[key]);
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggleSourceView(key)}
              title={
                s.active
                  ? `${hint}(${isCollapsed ? "点击展开" : "点击收起"}配置;修改需点「自定义配置」)`
                  : hint
              }
              className={cn(
                "flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[12px] transition-colors",
                s.active
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {label}
              {s.override && (
                <span className="rounded-sm bg-primary/15 px-1 py-px text-[10px] leading-none">
                  自定义
                </span>
              )}
              {s.inherited && (
                <span className="rounded-sm bg-muted px-1 py-px text-[10px] leading-none text-muted-foreground">
                  要素
                </span>
              )}
            </button>
          );
        })}
        {activeKeys >= 2 && (
          <span
            className="rounded-md bg-primary/5 px-1.5 py-0.5 text-[11px] text-primary"
            title={`${activeKeys} 个数据源叠加,生成时任取其一(随机选源取值)`}
          >
            任取其一
          </span>
        )}
      </div>

      {/* 当前激活源的配置面板(未选择要素时不显示) */}
      <div className="mt-2.5 space-y-2">
        {isInherited && !labelHasSources && (
          <div className="rounded-md border border-dashed bg-muted/20 px-2.5 py-1.5 text-[11.5px] text-muted-foreground">
            当前要素未配置默认数据源,生成结果为空
          </div>
        )}
        {isInherited && labelHasSources && (
          <div className="rounded-md border border-dashed bg-muted/30 px-2.5 py-1.5 text-[11.5px] text-muted-foreground">
            当前继承地址要素「{currentLabel?.label ?? step.name}」默认配置,全部只读;
            修改需点击右上「自定义配置」
          </div>
        )}
        {sourceStates
          .filter((s) => s.active && !collapsed[s.key])
          .map(({ key, override, inherited }) => (
            <SourceConfigPanel
              key={key}
              source={key}
              value={(override ? data[key] : currentLabel?.data?.[key])!}
              disabled={inherited}
              onChange={(v) => patchSource(key, v)}
              onRemove={override ? () => removeSource(key) : undefined}
              candidates={candidates}
            />
          ))}
      </div>

      {/* 前后缀(继承要素默认时只读,点「自定义配置」后可改) */}
      <div className="mt-4.5 grid gap-6 md:grid-cols-2">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="block text-[11.5px] font-medium text-muted-foreground">
              前缀
            </span>
            <RateSlider
              label="前缀跳过"
              value={viewPrefix?.skipRate ?? 0}
              disabled={isInherited}
              onChange={(v) => patchAffix("prefix", { skipRate: v })}
            />
          </div>
          <TagInput
            value={(viewPrefix?.texts ?? []).map((v) => ({ value: v }))}
            disabled={isInherited}
            onChange={(entries) =>
              patchAffix("prefix", { texts: entries.map((e) => e.value) })
            }
            max={Number.POSITIVE_INFINITY}
            placeholder="回车添加前缀,如:大"
            enableCopy={!isInherited}
          />
        </div>

        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="block text-[11.5px] font-medium text-muted-foreground">
              后缀
            </span>
            <RateSlider
              label="后缀跳过"
              value={viewSuffix?.skipRate ?? 0}
              disabled={isInherited}
              onChange={(v) => patchAffix("suffix", { skipRate: v })}
            />
          </div>
          <TagInput
            value={(viewSuffix?.texts ?? []).map((v) => ({ value: v }))}
            disabled={isInherited}
            onChange={(entries) =>
              patchAffix("suffix", { texts: entries.map((e) => e.value) })
            }
            max={Number.POSITIVE_INFINITY}
            placeholder="回车添加后缀,如:路"
            enableCopy={!isInherited}
          />
        </div>
      </div>

      <div className="mt-2.5">
        <RateSlider
          value={viewSkipRate}
          disabled={isInherited}
          onChange={(skipRate) => patch({ skipRate: skipRate ?? 0 })}
          label={isInherited ? "整步跳过(要素默认)" : "整步跳过"}
        />
      </div>

      {/* 干扰率:继承模式只读(要素默认),点「自定义配置」后可改 */}
      <div className="mt-2.5">
        <RateSlider
          label={isInherited ? "干扰(要素默认)" : "干扰"}
          value={viewNoiseRate}
          disabled={isInherited}
          onChange={(noiseRate) => patch({ noiseRate: noiseRate ?? 0 })}
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
        </>
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
