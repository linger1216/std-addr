"use client";

import { useEffect, useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchSelect } from "@/components/ui/search-select";
import { RateSlider } from "@/components/ui/rate-slider";
import { previewStepValues, type CandidatePool } from "@/lib/addr-sim/generator";
import type { RouterOutputs } from "@/trpc/react";
// 表单的纯数据映射(toForm/toSubmit/schema)独立成模块,便于单元测试
import {
  formSchema,
  toForm,
  toSubmit,
  type LabelFormValues,
  type FormSchema,
} from "./label-form-mappers";
import { LabelAffixEditor, LabelDataEditor } from "./label-data-editor";

/** 详情类型 = getById 输出(单一事实来源) */
export type LabelDetail = NonNullable<RouterOutputs["label"]["getById"]>;

/** 提交值类型定义在 mappers 模块(与 toForm/toSubmit 同源) */
export type { LabelFormValues } from "./label-form-mappers";

/** 预览候选池兜底(未传入 candidates 时 randomValue 源空 → 预览跳过该段) */
const EMPTY_POOL: CandidatePool = {
  road: [],
  community: [],
  village: [],
  poi: [],
};

export function LabelFormDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
  isPending,
  candidates,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  initial: LabelDetail | LabelFormValues | null;
  onSubmit: (values: LabelFormValues) => void;
  isPending: boolean;
  /** P0-6:候选值池(实体表);不传时 randomValue 源预览为空 */
  candidates?: CandidatePool;
}) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormSchema>({
    resolver: zodResolver(formSchema),
    defaultValues: toForm(null),
  });

  // —— 预览 ——
  const [showPreview, setShowPreview] = useState(false);
  const [previewTick, setPreviewTick] = useState(0);
  const previewData = useWatch({ control, name: "data" });
  const previewPrefix = useWatch({ control, name: "prefix" });
  const previewSuffix = useWatch({ control, name: "suffix" });
  const previewLabel = useWatch({ control, name: "label" });
  const previewSkipRate = useWatch({ control, name: "skipRate" });
  const previewNoiseRate = useWatch({ control, name: "noiseRate" });

  const pool = candidates ?? EMPTY_POOL;

  // 用当前配置生成 8 条样本(resolved step 直接把 label 默认当生效配置)
  const previewSamples = useMemo(() => {
    if (!showPreview) return [];
    const resolved = {
      name: previewLabel || "要素",
      data: previewData ?? {},
      prefix: previewPrefix ?? undefined,
      suffix: previewSuffix ?? undefined,
      skipRate: previewSkipRate ?? 0,
      noiseRate: previewNoiseRate ?? 0,
    };
    return previewStepValues(resolved, 8, {
      rng: Math.random,
      candidates: pool,
      realNames: Object.values(pool).flat(),
    });
    // previewTick 用于手动重抽
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPreview, previewData, previewPrefix, previewSuffix, previewSkipRate, previewNoiseRate, pool, previewTick]);

  // 打开 / 切换 initial 时同步表单
  useEffect(() => {
    if (open) reset(toForm(initial));
  }, [open, initial, reset]);

  const isEdit = initial != null && "createdAt" in initial;

  function handleValid(values: FormSchema) {
    onSubmit(toSubmit(values));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑要素" : "新建要素"}</DialogTitle>
          <DialogDescription>
            维护地址组件要素字典(name 为英文代号)+ 模拟器默认数据来源 / 前后缀。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleValid)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="名称 *" error={errors.name?.message}>
              <Input
                id="l-name"
                placeholder="例如:province"
                aria-invalid={!!errors.name}
                {...register("name")}
              />
            </Field>
            <Field label="状态">
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <SearchSelect<string>
                    value={String(field.value)}
                    onValueChange={(v) => field.onChange(Number(v))}
                    options={[
                      { value: "1", label: "启用" },
                      { value: "0", label: "禁用" },
                    ]}
                    placeholder="状态"
                    triggerClassName="h-9 w-full"
                    inputClassName="h-8"
                  />
                )}
              />
            </Field>
          </div>

          <Field
            label="标签"
            hint="中文注释,可留空(如 省份 / 城市)"
            error={errors.label?.message}
          >
            <Input
              id="l-label"
              placeholder="例如:省份"
              aria-invalid={!!errors.label}
              {...register("label")}
            />
          </Field>

          {/* P0-6:默认数据来源(randomValue/customValue/randomNumber/randomChinese 任意组合) */}
          <Field
            label="默认数据来源"
            hint="生成地址时该要素的默认取值方式;规则步骤可单独覆盖"
            error={errors.data?.message}
          >
            <Controller
              control={control}
              name="data"
              render={({ field }) => (
                <LabelDataEditor
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </Field>

          {/* P0-6:整体默认跳过率 + 干扰率(生成时整步丢失概率 / 注入错别字·丢字·漏字) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="整体跳过率"
              hint="生成地址时该要素有概率整步丢失(0~100%),规则步骤可单独覆盖"
            >
              <Controller
                control={control}
                name="skipRate"
                render={({ field }) => (
                  <RateSlider
                    label="整体跳过"
                    value={field.value ?? 0}
                    onChange={(v) => field.onChange(v)}
                  />
                )}
              />
            </Field>
            <Field
              label="干扰率"
              hint="生成时注入错别字 / 丢字 / 漏字,作为训练干扰项(0~100%)"
            >
              <Controller
                control={control}
                name="noiseRate"
                render={({ field }) => (
                  <RateSlider
                    label="干扰"
                    value={field.value ?? 0}
                    onChange={(v) => field.onChange(v)}
                  />
                )}
              />
            </Field>
          </div>

          {/* P0-6:默认前后缀 */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="默认前缀" hint="生成时拼接在值前面,如:大">
              <Controller
                control={control}
                name="prefix"
                render={({ field }) => (
                  <LabelAffixEditor
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="回车添加前缀,如:大"
                  />
                )}
              />
            </Field>
            <Field label="默认后缀" hint="生成时拼接在值后面,如:路">
              <Controller
                control={control}
                name="suffix"
                render={({ field }) => (
                  <LabelAffixEditor
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="回车添加后缀,如:路"
                  />
                )}
              />
            </Field>
          </div>

          {/* P0-6:配置预览(实时按当前 data/prefix/suffix 生成样本) */}
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                className="text-[12px] font-medium text-primary hover:underline"
              >
                {showPreview ? "收起预览" : "预览 8 条样本"}
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
              {showPreview && (
                <span className="ml-auto text-[11px] text-muted-foreground">
                  randomValue 源需候选池(candidates)传入才有值
                </span>
              )}
            </div>
            {showPreview && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {previewSamples.map((s, i) => (
                  <span
                    key={i}
                    className={
                      "rounded-lg border px-2 py-0.5 text-[12px] " +
                      (s === null
                        ? "border-dashed text-muted-foreground/50 line-through"
                        : "border-border bg-muted/40")
                    }
                  >
                    {s ?? "(跳过/空)"}
                  </span>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** 字段行(Label + 错误提示) —— 抽出来消除重复 */
function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && !error && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}