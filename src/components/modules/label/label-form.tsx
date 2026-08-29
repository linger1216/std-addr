"use client";

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

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
import type { RouterOutputs } from "@/trpc/react";
// 表单的纯数据映射(toForm/toSubmit/schema)独立成模块,便于单元测试
import {
  formSchema,
  toForm,
  toSubmit,
  type LabelFormValues,
  type FormSchema,
} from "./label-form-mappers";

/** 详情类型 = getById 输出(单一事实来源) */
export type LabelDetail = NonNullable<RouterOutputs["label"]["getById"]>;

/** 提交值类型定义在 mappers 模块(与 toForm/toSubmit 同源) */
export type { LabelFormValues } from "./label-form-mappers";

export function LabelFormDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  initial: LabelDetail | LabelFormValues | null;
  onSubmit: (values: LabelFormValues) => void;
  isPending: boolean;
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑要素" : "新建要素"}</DialogTitle>
          <DialogDescription>
            维护地址组件要素字典(name 为英文代号,如 province / city / road)。
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