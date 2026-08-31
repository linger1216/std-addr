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
  type StdAddressFormValues,
  type FormSchema,
} from "./std-address-form-mappers";

/** 详情类型 = getById 输出(单一事实来源) */
export type StdAddressDetail = NonNullable<
  RouterOutputs["stdAddress"]["getById"]
>;

/** 提交值类型定义在 mappers 模块(与 toForm/toSubmit 同源) */
export type { StdAddressFormValues } from "./std-address-form-mappers";

export function StdAddressFormDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  initial: StdAddressDetail | StdAddressFormValues | null;
  onSubmit: (values: StdAddressFormValues) => void;
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
          <DialogTitle>{isEdit ? "编辑地址记录" : "新建地址记录"}</DialogTitle>
          <DialogDescription>
            维护原始地址与标准化结果;标准化建议走列表「批量标准化」。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleValid)} className="space-y-4">
          {isEdit ? (
            // 编辑态:原始地址不可改(后端 update 不接收),只读展示
            <Field label="原始地址">
              <div className="rounded-xl border border-border bg-secondary/40 px-3 py-2 text-[13px] text-muted-foreground">
                {initial != null && "rawAddress" in initial
                  ? initial.rawAddress
                  : ""}
              </div>
            </Field>
          ) : (
            <Field label="原始地址 *" error={errors.rawAddress?.message}>
              <Input
                id="c-raw-address"
                placeholder="例如:永跃路260弄38号502室"
                aria-invalid={!!errors.rawAddress}
                {...register("rawAddress")}
              />
            </Field>
          )}

          <Field label="标准地址" hint="留空则只作为待标准化记录" error={errors.stdAddress?.message}>
            <Input
              id="c-std-address"
              placeholder="例如:上海市闵行区永跃路260弄38号502室"
              aria-invalid={!!errors.stdAddress}
              {...register("stdAddress")}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="标准评分" hint="0~10,一位小数" error={errors.stdScore?.message}>
              <Input
                id="c-std-score"
                type="number"
                min={0}
                max={10}
                step={0.1}
                placeholder="例如:8.5"
                aria-invalid={!!errors.stdScore}
                {...register("stdScore")}
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