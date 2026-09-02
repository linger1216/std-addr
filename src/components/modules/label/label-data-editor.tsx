"use client";

/**
 * Label 表单的数据来源 / 前后缀编辑器(P0-6)。
 *
 * 编辑对象:
 *  - data   = { randomValue?, customValue?, randomNumber?, randomChinese? } 4 个数据源,任意组合
 *    randomValue=实体表  customValue=自定义列表  randomNumber=随机数字  randomChinese=随机中文
 *  - prefix = { texts, skipRate } 默认前缀
 *  - suffix = { texts, skipRate } 默认后缀
 *
 * 纯受控组件(value/onChange),不依赖 react-hook-form,便于任意表单接入。
 */

import { memo } from "react";
import { Eraser } from "lucide-react";

import { cn } from "@/lib/utils";
import { SearchSelect } from "@/components/ui/search-select";
import { TagInput } from "@/components/ui/tag-input";
import { NumField } from "@/components/ui/num-field";
import { RateSlider } from "@/components/ui/rate-slider";
import {
  DEFAULT_AFFIX_SKIP_RATE,
  type AddrSimAffix,
  type AddrSimLabelData,
  type AddrSimSourceName,
} from "@/lib/validators/addr-sim";

const SOURCE_TABLE_OPTIONS: Array<{ value: AddrSimSourceName; label: string }> = [
  { value: "road", label: "道路(road)" },
  { value: "community", label: "小区(community)" },
  { value: "village", label: "村(village)" },
  { value: "poi", label: "兴趣点(poi)" },
];

const RANDOM_NUMBER_FORMATS: Array<{ value: "arabic" | "chinese"; label: string }> = [
  { value: "arabic", label: "阿拉伯数字" },
  { value: "chinese", label: "中文数字" },
];

type SourceKey = "randomValue" | "customValue" | "randomNumber" | "randomChinese";

const SOURCE_TOGGLES: Array<{ key: SourceKey; label: string; hint: string }> = [
  { key: "randomValue", label: "实体表", hint: "从 road/community/village/poi 抽 1" },
  { key: "customValue", label: "自定义列表", hint: "从自定义候选值抽 1" },
  { key: "randomNumber", label: "随机数字", hint: "随机数字(arabic/chinese)" },
  { key: "randomChinese", label: "随机中文", hint: "真实命名词典随机汉字" },
];

/** 前后缀默认值:跳过率默认 10%(新配置未显式设置时的默认率) */
const EMPTY_AFFIX: AddrSimAffix = { texts: [], skipRate: 10 };

/** 数据来源编辑器 */
export const LabelDataEditor = memo(function LabelDataEditor({
  value,
  onChange,
}: {
  value: AddrSimLabelData | null | undefined;
  onChange: (next: AddrSimLabelData | null) => void;
}) {
  const data = value ?? {};

  function patchData(next: AddrSimLabelData | null) {
    onChange(
      next &&
        (next.randomValue || next.customValue || next.randomNumber || next.randomChinese)
        ? next
        : null,
    );
  }

  /** toggle 某个源 */
  function toggle(key: SourceKey) {
    const has = data[key] !== undefined;
    if (has) {
      const next: AddrSimLabelData = { ...data };
      delete next[key];
      patchData(next);
    } else {
      let defaultValue: AddrSimLabelData[SourceKey];
      if (key === "randomValue") defaultValue = { name: "road" };
      else if (key === "customValue") defaultValue = { list: [] };
      else if (key === "randomNumber")
        defaultValue = { format: "arabic", minDigits: 1, maxDigits: 4 };
      else defaultValue = { minLength: 2, maxLength: 4 };
      patchData({ ...data, [key]: defaultValue });
    }
  }

  /** 更新某源配置 */
  function patchSource<K extends SourceKey>(key: K, v: NonNullable<AddrSimLabelData[K]>) {
    patchData({ ...data, [key]: v });
  }

  const activeCount = [data.randomValue, data.customValue, data.randomNumber, data.randomChinese].filter(
    (s) => s !== undefined,
  ).length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {SOURCE_TOGGLES.map(({ key, label, hint }) => {
          const active = data[key] !== undefined;
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key)}
              title={hint}
              className={cn(
                "rounded-lg border px-2 py-1 text-[12px] transition-colors",
                active
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {label}
            </button>
          );
        })}
        {activeCount >= 2 && (
          <span className="rounded-md bg-primary/5 px-1.5 py-0.5 text-[11px] text-primary">
            任取其一
          </span>
        )}
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => onChange(null)}
            title="清除全部数据来源"
            className="ml-auto flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-danger"
          >
            <Eraser className="size-3" />
            清除
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        {data.randomValue !== undefined && (
          <div className="flex items-center gap-2">
            <SearchSelect<AddrSimSourceName>
              value={data.randomValue.name ?? "road"}
              onValueChange={(v) => patchSource("randomValue", { name: v })}
              options={SOURCE_TABLE_OPTIONS}
              placeholder="候选表"
              triggerClassName="h-8 min-w-40"
              inputClassName="h-7"
            />
          </div>
        )}

        {data.customValue !== undefined && (
          <div>
            <TagInput
              value={(data.customValue?.list ?? []).map((v) => ({ value: v }))}
              onChange={(entries) =>
                patchSource("customValue", { list: entries.map((e) => e.value) })
              }
              placeholder="回车添加候选值;支持 N->M 范围(如 1->9)"
              max={Number.POSITIVE_INFINITY}
              enableCopy
            />
          </div>
        )}

        {data.randomNumber !== undefined && (
          <div className="flex flex-wrap items-center gap-2">
            <SearchSelect<"arabic" | "chinese">
              value={data.randomNumber.format ?? "arabic"}
              onValueChange={(v) =>
                patchSource("randomNumber", {
                  format: v,
                  minDigits: data.randomNumber?.minDigits ?? 1,
                  maxDigits: data.randomNumber?.maxDigits ?? 4,
                  ...(data.randomNumber?.weights
                    ? { weights: data.randomNumber.weights }
                    : {}),
                })
              }
              options={RANDOM_NUMBER_FORMATS}
              placeholder="格式"
              triggerClassName="h-8 min-w-28"
              inputClassName="h-7"
            />
            <div className="flex items-center gap-1">
              <span className="text-[11.5px] text-muted-foreground">位数</span>
              <NumField
                value={data.randomNumber?.minDigits ?? 1}
                onChange={(minDigits) =>
                  patchSource("randomNumber", {
                    format: data.randomNumber?.format ?? "arabic",
                    minDigits,
                    maxDigits: data.randomNumber?.maxDigits ?? 4,
                    ...(data.randomNumber?.weights
                      ? { weights: data.randomNumber.weights }
                      : {}),
                  })
                }
                min={1}
                max={9}
              />
              <span className="text-[11.5px] text-muted-foreground">至</span>
              <NumField
                value={data.randomNumber?.maxDigits ?? 4}
                onChange={(maxDigits) =>
                  patchSource("randomNumber", {
                    format: data.randomNumber?.format ?? "arabic",
                    minDigits: data.randomNumber?.minDigits ?? 1,
                    maxDigits,
                    ...(data.randomNumber?.weights
                      ? { weights: data.randomNumber.weights }
                      : {}),
                  })
                }
                min={1}
                max={9}
              />
            </div>
          </div>
        )}

        {data.randomChinese !== undefined && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="text-[11.5px] text-muted-foreground">长度</span>
              <NumField
                value={data.randomChinese?.minLength ?? 2}
                onChange={(minLength) =>
                  patchSource("randomChinese", {
                    minLength,
                    maxLength: data.randomChinese?.maxLength ?? 4,
                  })
                }
                min={1}
                max={20}
              />
              <span className="text-[11.5px] text-muted-foreground">至</span>
              <NumField
                value={data.randomChinese?.maxLength ?? 4}
                onChange={(maxLength) =>
                  patchSource("randomChinese", {
                    minLength: data.randomChinese?.minLength ?? 2,
                    maxLength,
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
    </div>
  );
});

/** 前后缀编辑器(单一 affix:prefix 或 suffix) */
export const LabelAffixEditor = memo(function LabelAffixEditor({
  value,
  onChange,
  placeholder,
}: {
  value: AddrSimAffix | null | undefined;
  onChange: (next: AddrSimAffix | null) => void;
  placeholder: string;
}) {
  const affix = value ?? EMPTY_AFFIX;

  function patch(p: Partial<AddrSimAffix>) {
    const next: AddrSimAffix = { ...affix, ...p };
    const hasTexts = (next.texts ?? []).some((t) => t.trim() !== "");
    onChange(hasTexts || (next.skipRate ?? 0) > 0 ? next : null);
  }

  return (
    <div className="space-y-1.5">
      <TagInput
        value={(affix.texts ?? []).map((v) => ({ value: v }))}
        onChange={(entries) => patch({ texts: entries.map((e) => e.value) })}
        placeholder={placeholder}
        max={Number.POSITIVE_INFINITY}
        enableCopy
      />
      <RateSlider
        label="跳过率"
        value={affix.skipRate ?? DEFAULT_AFFIX_SKIP_RATE}
        onChange={(v) => patch({ skipRate: v ?? 0 })}
      />
    </div>
  );
});