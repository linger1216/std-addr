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
import { TagInput } from "@/components/ui/tag-input";
import type { RegionOption } from "./subarea-toolbar";
import type { RouterOutputs } from "@/trpc/react";
// 表单的纯数据映射(toForm/toSubmit/schema)独立成模块,便于单元测试
import {
  formSchema,
  toForm,
  toSubmit,
  type SubareaFormValues,
  type FormSchema,
} from "./subarea-form-mappers";

/** 详情类型 = getById 输出(单一事实来源) */
export type SubareaDetail = NonNullable<
  RouterOutputs["subarea"]["getById"]
>;

/** 提交值类型定义在 mappers 模块(与 toForm/toSubmit 同源) */
export type { SubareaFormValues } from "./subarea-form-mappers";

export function SubareaFormDialog({
  open,
  onOpenChange,
  initial,
  regions,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  initial: SubareaDetail | SubareaFormValues | null;
  regions: RegionOption[];
  onSubmit: (values: SubareaFormValues) => void;
  isPending: boolean;
}) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    getValues,
    setValue,
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
  // 属性条目(key + 值列表)
  const {
    fields: propFields,
    append: appendProp,
    remove: removeProp,
  } = useFieldArray({
    control,
    name: "property",
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
          <DialogTitle>{isEdit ? "编辑子区域" : "新建子区域"}</DialogTitle>
          <DialogDescription>
            维护住宅子区域的基本资料与区划归属。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleValid)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="名称 *" error={errors.name?.message}>
              <Input
                id="c-name"
                placeholder="例如:阳光花园"
                aria-invalid={!!errors.name}
                {...register("name")}
              />
            </Field>
            <Field label="别名" hint="输入后回车添加;空列表保存后别名清空">
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
                    id={`c-address-${index}`}
                    placeholder={`地址 ${index + 1}`}
                    aria-label={`地址 ${index + 1}`}
                    {...register(`address.${index}.value`)}
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

          <Field
            label="属性"
            hint="键值属性,如 building:[1, 3, A];每个属性回车添加多个值"
            error={errors.property?.message}
          >
            <div className="space-y-2">
              {propFields.length === 0 && (
                <p className="text-[12px] text-muted-foreground">
                  暂无属性,点击下方按钮添加。
                </p>
              )}
              {propFields.map((field, index) => (
                <div
                  key={field.id}
                  className="flex items-start gap-2 rounded-xl border border-border p-2"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-10 shrink-0 text-[11.5px] text-muted-foreground">
                        键
                      </span>
                      <Input
                        id={`c-property-${index}-key`}
                        placeholder="如 building"
                        aria-label={`属性 ${index + 1} 键`}
                        className="h-7 w-40 text-[12.5px]"
                        {...register(`property.${index}.key`)}
                      />
                    </div>
                    <TagInput
                      value={getValues(`property.${index}.values`) ?? []}
                      onChange={(entries) =>
                        setValue(`property.${index}.values`, entries, {
                          shouldValidate: true,
                        })
                      }
                      placeholder="回车添加属性值,如：1"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeProp(index)}
                    aria-label={`删除属性 ${index + 1}`}
                    title="删除该条属性"
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
                onClick={() => appendProp({ key: "", values: [] })}
              >
                <Plus className="size-3.5" />
                添加属性
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