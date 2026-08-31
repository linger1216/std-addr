"use client";

import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Save, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchSelect } from "@/components/ui/search-select";
import { formatDateTime } from "@/lib/format";
import type { RouterOutputs } from "@/trpc/react";
import {
  EMPTY_FORM,
  formSchema,
  toForm,
  toSubmit,
  type MenusFormValues,
} from "./menus-form-mappers";
import { IconPicker } from "./icon-picker";

/** 提交值 = toSubmit 输出 */
export type MenuDetailSubmit = {
  id?: string;
  name: string;
  path: string | null;
  icon: string | null;
  sort: number;
  visible: boolean;
  parentId: string | null;
};

export type MenuDetailFormValues = MenusFormValues & { id: string | null };

/** 选中的菜单记录(listAll 项,含 createdAt/updatedAt) */
export type MenuDetailRecord = RouterOutputs["menu"]["listAll"][number];

function EmptyState() {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 text-center">
      <p className="text-sm text-muted-foreground">
        从左侧树中选择一个菜单查看与编辑
      </p>
      <p className="text-xs text-muted-foreground/60">
        或点击右上角「新建菜单」创建顶级菜单
      </p>
    </div>
  );
}

export function MenusDetailForm({
  record,
  createMode,
  createParentId,
  parentOptions,
  isSaving,
  onCreate,
  onUpdate,
  onDelete,
  onCancelCreate,
}: {
  /** 编辑对象(listAll 项);null 且非新建时显示空态 */
  record: MenuDetailRecord | null;
  createMode: boolean;
  /** 新建模式的预设父级(null=顶级) */
  createParentId: string | null;
  parentOptions: { id: string; name: string; depth: number }[];
  isSaving: boolean;
  onCreate: (values: MenuDetailSubmit) => void;
  onUpdate: (values: MenuDetailSubmit) => void;
  onDelete: () => void;
  onCancelCreate: () => void;
}) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<MenuDetailFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { id: null, ...EMPTY_FORM },
    mode: "onChange",
  });

  // 切换编辑对象 / 进入新建模式时,同步表单初值
  React.useEffect(() => {
    if (createMode) {
      reset({ id: null, ...EMPTY_FORM, parentId: createParentId ?? "" });
    } else {
      reset(toForm(record));
    }
  }, [createMode, createParentId, record, reset]);

  // 未选中且非新建 → 空态
  if (!createMode && !record) return <EmptyState />;

  const isEdit = !createMode;
  const title = createMode
    ? createParentId
      ? "新建子菜单"
      : "新建顶级菜单"
    : record
      ? `编辑「${record.name}」`
      : "";

  function handleValid(values: MenuDetailFormValues) {
    const submit = toSubmit(values);
    if (createMode) onCreate(submit);
    else onUpdate(submit);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 标题(固定区) */}
      <div className="shrink-0 border-b pb-3">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {createMode
            ? "填写信息后保存,新菜单将出现在左侧树中"
            : "修改后点击保存生效;拖拽左侧树可调整同级顺序"}
        </p>
      </div>

      {/* 表单(滚动区) */}
      <form
        id="menus-detail-form"
        onSubmit={handleSubmit(handleValid)}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="名称 *" error={errors.name?.message}>
            <Input
              placeholder="例如:用户管理"
              aria-invalid={!!errors.name}
              {...register("name")}
            />
          </Field>
          <Field label="排序(整数,越小越靠前)" error={errors.sort?.message}>
            <Input
              type="number"
              aria-invalid={!!errors.sort}
              {...register("sort")}
            />
          </Field>
        </div>

        <Field label="路径(父菜单可留空)" error={errors.path?.message}>
          <Input
            placeholder="/users"
            aria-invalid={!!errors.path}
            {...register("path")}
          />
        </Field>

        <Field label="图标" error={errors.icon?.message}>
          <Controller
            control={control}
            name="icon"
            render={({ field }) => (
              <IconPicker value={field.value || null} onChange={field.onChange} />
            )}
          />
        </Field>

        <Field label="父菜单">
          <Controller
            control={control}
            name="parentId"
            render={({ field }) => (
              <SearchSelect
                value={field.value || ""}
                onValueChange={(v) => field.onChange(v ?? "")}
                options={[
                  { value: "", label: "顶级菜单" },
                  ...parentOptions.map((o) => ({
                    value: o.id,
                    label: `${"　".repeat(o.depth)}${o.name}`,
                  })),
                ]}
                placeholder="选择父菜单"
                triggerClassName="h-9 w-full"
                inputClassName="h-8"
              />
            )}
          />
        </Field>

        <div className="flex items-center gap-2">
          <Controller
            control={control}
            name="visible"
            render={({ field }) => (
              <Checkbox
                checked={!!field.value}
                onCheckedChange={(c) => field.onChange(!!c)}
              />
            )}
          />
          <Label>显示在侧边栏</Label>
        </div>

        {/* 详情字段顺序约定:创建/更新时间放最后 */}
        {isEdit && record && (
          <div className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>创建时间</span>
              <span>{formatDateTime(record.createdAt)}</span>
            </div>
            <div className="flex justify-between">
              <span>更新时间</span>
              <span>{formatDateTime(record.updatedAt)}</span>
            </div>
          </div>
        )}
      </form>

      {/* 底部操作(固定区) */}
      <div className="flex shrink-0 items-center justify-between border-t pt-3">
        <div>
          {isEdit ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onDelete}
              className="text-danger hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 className="size-3.5" />
              删除菜单
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancelCreate}
            >
              <X className="size-3.5" />
              取消新建
            </Button>
          )}
        </div>
        <Button
          type="submit"
          form="menus-detail-form"
          size="sm"
          disabled={isSaving || (!isDirty && !createMode)}
        >
          <Save className="size-3.5" />
          {isSaving ? "保存中…" : "保存"}
        </Button>
      </div>
    </div>
  );
}

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