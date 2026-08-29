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
import { TagInput } from "@/components/ui/tag-input";
import type { RegionOption } from "./village-toolbar";
import type { RouterOutputs } from "@/trpc/react";
// 表单的纯数据映射(toForm/toSubmit/schema)独立成模块,便于单元测试
import {
  formSchema,
  toForm,
  toSubmit,
  type VillageFormValues,
  type FormSchema,
} from "./village-form-mappers";

/** 详情类型 = getById 输出(单一事实来源) */
export type VillageDetail = NonNullable<
  RouterOutputs["village"]["getById"]
>;

/** 提交值类型定义在 mappers 模块(与 toForm/toSubmit 同源) */
export type { VillageFormValues } from "./village-form-mappers";

export function VillageFormDialog({
  open,
  onOpenChange,
  initial,
  regions,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  initial: VillageDetail | VillageFormValues | null;
  regions: RegionOption[];
  onSubmit: (values: VillageFormValues) => void;
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
          <DialogTitle>{isEdit ? "编辑村" : "新建村"}</DialogTitle>
          <DialogDescription>
            维护自然村 / 行政村的基本资料与区划归属。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleValid)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="名称 *" error={errors.name?.message}>
              <Input
                id="v-name"
                placeholder="例如:上杭村"
                aria-invalid={!!errors.name}
                {...register("name")}
              />
            </Field>
            <Field label="所属区划">
              <Controller
                control={control}
                name="regionId"
                render={({ field }) => (
                  <SearchSelect
                    value={field.value}
                    onValueChange={field.onChange}
                    options={[
                      { value: "", label: "未指定" },
                      ...regions.map((r) => ({ value: r.id, label: r.name })),
                    ]}
                    placeholder="选择区划"
                    triggerClassName="h-9 w-full"
                    inputClassName="h-8"
                  />
                )}
              />
            </Field>
          </div>

          <Field
            label="状态"
            error={errors.status?.message}
          >
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

          <Field
            label="别名"
            hint="输入后回车添加;空列表保存后别名清空"
            error={errors.alias?.message}
          >
            <Controller
              control={control}
              name="alias"
              render={({ field }) => (
                <TagInput
                  value={field.value}
                  onChange={field.onChange}
                  max={20}
                />
              )}
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
