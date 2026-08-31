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
import type { StdAddressFieldKey } from "./std-address-fields";
import { STD_ADDRESS_FIELDS } from "./std-address-fields";
// 表单的纯数据映射(toForm/toSubmit/schema)独立成模块,便于单元测试
import {
  formSchema,
  toForm,
  toSubmit,
  formatScoreInput,
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
  // 评分由标准化流程自动计算,只读展示(从详情原值读取,不进 RHF);
  // "stdScore" in initial 已把联合类型收窄到详情分支
  const scoreText =
    initial != null && "stdScore" in initial
      ? formatScoreInput(initial.stdScore)
      : "";

  function handleValid(values: FormSchema) {
    onSubmit(toSubmit(values));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑地址记录" : "新建地址记录"}</DialogTitle>
          <DialogDescription>
            原始地址 + 标准结果 + 27 个地址要素;评审分由「批量标准化」自动计算。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleValid)} className="space-y-5">
          {/* 基础区 */}
          <div className="space-y-4">
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
              <Field
                label="标准评分"
                hint="由「批量标准化」自动计算,保存不会修改评分"
              >
                <Input
                  value={scoreText}
                  disabled
                  placeholder="—"
                  className="bg-secondary/40 text-muted-foreground"
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
          </div>

          {/* 27 地址要素:全字段展示与编辑 */}
          <div className="space-y-3 border-t pt-4">
            <p className="text-[12px] font-medium text-muted-foreground">
              地址要素(共 27 项,留空表示未填写)
            </p>
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
              {STD_ADDRESS_FIELDS.map(([key, label]) => (
                <Field key={key} label={label}>
                  <Input placeholder="未填写" {...register(key)} />
                </Field>
              ))}
            </div>
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