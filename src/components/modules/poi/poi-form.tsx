"use client";

import { useEffect } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";

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
import { AliasTagInput } from "@/components/modules/shared/alias-tag-input";
import type { RegionOption } from "./poi-toolbar";
import type { RouterOutputs } from "@/trpc/react";
// 表单的纯数据映射(toForm/toSubmit/schema)独立成模块,便于单元测试
import {
  formSchema,
  toForm,
  toSubmit,
  type PoiFormValues,
  type FormSchema,
} from "./poi-form-mappers";

/** 详情类型 = getById 输出(单一事实来源) */
export type PoiDetail = NonNullable<RouterOutputs["poi"]["getById"]>;

/** 提交值类型定义在 mappers 模块(与 toForm/toSubmit 同源) */
export type { PoiFormValues } from "./poi-form-mappers";

export function PoiFormDialog({
  open,
  onOpenChange,
  initial,
  regions,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  initial: PoiDetail | PoiFormValues | null;
  regions: RegionOption[];
  onSubmit: (values: PoiFormValues) => void;
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

  // 地址条目列表:新增/删除走 useFieldArray,提交时才序列化成 JSON
  const { fields, append, remove } = useFieldArray({
    control,
    name: "address",
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
          <DialogTitle>{isEdit ? "编辑 POI" : "新建 POI"}</DialogTitle>
          <DialogDescription>
            维护兴趣点的名称、分类与地址信息。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleValid)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="名称 *" error={errors.name?.message}>
              <Input
                id="p-name"
                placeholder="例如:市第一人民医院"
                aria-invalid={!!errors.name}
                {...register("name")}
              />
            </Field>
            <Field label="类型" error={errors.type?.message}>
              <Input
                id="p-type"
                placeholder="例如:医院"
                aria-invalid={!!errors.type}
                {...register("type")}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

          <Field label="别名" hint="输入后回车添加;空列表保存后别名清空">
            <Controller
              control={control}
              name="alias"
              render={({ field }) => (
                <AliasTagInput
                  value={field.value}
                  onChange={field.onChange}
                  max={20}
                />
              )}
            />
          </Field>

          <Field
            label="地址"
            hint="可添加多条,每条一个地址;空列表保存后地址为空"
            error={errors.address?.message}
          >
            <div className="space-y-2">
              {fields.length === 0 && (
                <p className="text-[12px] text-muted-foreground">暂无地址,点击下方按钮添加。</p>
              )}
              {fields.map((field, index) => (
                <div key={field.id} className="flex items-center gap-2">
                  <Input
                    id={`p-address-${index}`}
                    placeholder={`地址 ${index + 1}`}
                    aria-label={`地址 ${index + 1}`}
                    {...register(`address.${index}.value` as const)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => remove(index)}
                    aria-label={`删除地址 ${index + 1}`}
                    title="删除该条地址"
                    className="shrink-0 text-muted-foreground hover:text-danger"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ value: "" })}
              >
                <Plus className="size-3.5" />
                添加地址
              </Button>
            </div>
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