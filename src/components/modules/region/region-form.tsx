"use client";

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronRight, Plus, Save, Trash2, Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import { TagInput } from "@/components/ui/tag-input";
import { SearchSelect } from "@/components/ui/search-select";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { formatDateTime } from "@/lib/format";
import { STATUS_LABEL, STATUS_BADGE_CLASS } from "@/lib/constants";
import { cn } from "@/lib/utils";

import {
  regionFormSchema,
  regionTypeOptions,
  toForm,
  toSubmit,
  type RegionFormSchema,
  type RegionFormValues,
  type RegionTreeNode,
} from "./region-form-mappers";

export type { RegionFormValues } from "./region-form-mappers";

/** 上级下拉选项(由页面从整棵树压平) */
export type ParentOption = { value: string; label: string };

/** 表单共用 hook:打开/切换节点时 reset;presetParentCode 覆盖上级(新建子节点用) */
function useRegionForm(
  node: RegionTreeNode | null | undefined,
  active: boolean,
  presetParentCode?: string | null,
) {
  const form = useForm<RegionFormSchema>({
    resolver: zodResolver(regionFormSchema),
    defaultValues: toForm(null),
  });
  useEffect(() => {
    if (!active) return;
    const base = toForm(node);
    if (presetParentCode !== undefined && presetParentCode !== null) {
      base.parentCode = presetParentCode;
    }
    form.reset(base);
  }, [active, node, form, presetParentCode]);
  return form;
}

/** 表单实例类型(RegionFields 两个容器共用的 prop) */
type RegionForm = ReturnType<typeof useRegionForm>;

/* ───────────────────────── 新建区划节点 Dialog ───────────────────────── */
// 新建走 Dialog(上级可预设);编辑走右侧 RegionEditPanel,两个容器共用 RegionFields
export function RegionFormDialog({
  open,
  onOpenChange,
  presetParentCode,
  parentOptions,
  isPending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** 新建时预设的上级 code(null/缺省 = 顶级) */
  presetParentCode?: string | null;
  parentOptions: ParentOption[];
  isPending: boolean;
  onSubmit: (values: RegionFormValues) => void;
}) {
  const form = useRegionForm(null, open, presetParentCode);

  function handleValid(values: RegionFormSchema) {
    onSubmit(toSubmit(values));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>新建区划节点</DialogTitle>
          <DialogDescription>
            填写名称与标准编码;上级与层级自动计算。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleValid)} className="space-y-4">
          <RegionFields form={form} parentOptions={parentOptions} />

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

/* ───────────────────────── 右侧编辑面板 ───────────────────────── */

export function RegionEditPanel({
  node,
  parentOptions,
  isPending,
  onSaved,
  onAddChild,
  onDelete,
}: {
  node: RegionTreeNode;
  parentOptions: ParentOption[];
  isPending: boolean;
  onSaved: (values: RegionFormValues) => void;
  onAddChild: () => void;
  onDelete: () => void;
}) {
  const form = useRegionForm(node, true);

  function handleValid(values: RegionFormSchema) {
    onSaved(toSubmit(values));
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
      {/* 头部:名称 + 徽标 + 路径 */}
      <div className="shrink-0 border-b border-border px-5 pt-4 pb-3.5">
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate font-heading text-[18px] font-semibold tracking-[-0.01em]">
            {node.name}
          </h2>
          <Badge variant="outline" className="shrink-0 text-[11px] font-normal">
            第 {node.level} 级
          </Badge>
          <Badge
            className={cn(
              "shrink-0 border-transparent",
              STATUS_BADGE_CLASS[node.status as 0 | 1],
            )}
          >
            {STATUS_LABEL[node.status as 0 | 1]}
          </Badge>
        </div>
        <div className="mt-1.5 flex items-start gap-1.5 text-[12.5px] text-muted-foreground">
          <ChevronRight className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 break-all">{node.fullName ?? node.name}</span>
        </div>
        {Array.isArray(node.alias) && node.alias.length > 0 && (
          <div className="mt-1 flex items-start gap-1.5 text-[12.5px] text-muted-foreground">
            <span className="shrink-0 font-medium">别名</span>
            <span className="min-w-0 break-all">
              {(node.alias as string[]).join(" / ")}
            </span>
          </div>
        )}
      </div>

      {/* 表单区:内容自适应高度,不撑满导致下方空白 */}
      <div className="px-5 pt-4 pb-5">
        <form id="region-edit-form" onSubmit={form.handleSubmit(handleValid)}>
          <RegionFields form={form} parentOptions={parentOptions} />
        </form>

        <Separator className="mt-5 mb-4" />

        {/* 只读元信息:创建/更新时间放最后(与各模块详情约定一致) */}
        <div className="space-y-2.5 text-[13px]">
          <MetaRow label="节点 ID" hint="内部标识">
            {node.id}
          </MetaRow>
          <MetaRow label="创建时间">{formatDateTime(node.createdAt)}</MetaRow>
          <MetaRow label="更新时间">{formatDateTime(node.updatedAt)}</MetaRow>
        </div>
      </div>

      {/* 底部操作 */}
      <div className="flex shrink-0 items-center gap-2 border-t border-border px-5 py-3.5">
        <Button
          type="submit"
          form="region-edit-form"
          disabled={isPending}
          className="min-w-24"
        >
          <Save className="size-4" />
          {isPending ? "保存中…" : "保存修改"}
        </Button>
        <Button type="button" variant="outline" onClick={onAddChild}>
          <Plus className="size-4" />
          新建子节点
        </Button>
        <div className="flex-1" />
        <Button
          type="button"
          variant="outline"
          className="text-danger hover:bg-danger-soft hover:text-danger"
          onClick={onDelete}
        >
          <Trash2 className="size-4" />
          删除节点
        </Button>
      </div>
    </div>
  );
}

/* ───────────────────────── 表单字段(两个容器共用) ───────────────────────── */

function RegionFields({
  form,
  parentOptions,
}: {
  form: RegionForm;
  parentOptions: ParentOption[];
}) {
  const {
    register,
    control,
    formState: { errors },
  } = form;

  return (
    <>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="名称 *" error={errors.name?.message}>
            <Input
              id="r-name"
              placeholder="例如:聚缘居民委员会"
              aria-invalid={!!errors.name}
              {...register("name")}
            />
          </Field>
          <Field
            label="标准编码 *"
            hint="即 addressStandardCode 小区导入按此关联"
            error={errors.code?.message}
          >
            <Input
              id="r-code"
              placeholder="例如:310112114021"
              aria-invalid={!!errors.code}
              {...register("code")}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="上级节点" error={errors.parentCode?.message}>
            <Controller
              control={control}
              name="parentCode"
              render={({ field }) => (
                <SearchSelect
                  value={field.value}
                  onValueChange={field.onChange}
                  options={[
                    { value: "", label: "(顶级)" },
                    ...parentOptions,
                  ]}
                  placeholder="选择上级"
                  triggerClassName="h-9 w-full"
                  inputClassName="h-8"
                />
              )}
            />
          </Field>
          <Field label="类型" error={errors.type?.message}>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <SearchSelect<string>
                  value={field.value}
                  onValueChange={field.onChange}
                  options={[
                    { value: "", label: "(未设置)" },
                    ...regionTypeOptions(field.value).map((t) => ({
                      value: t,
                      label: t,
                    })),
                  ]}
                  placeholder="选择类型"
                  triggerClassName="h-9 w-full"
                  inputClassName="h-8"
                />
              )}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="别名"
            hint="曾用名 / 别称,输入后回车添加;空列表保存后别名清空"
          >
            <Controller
              control={control}
              name="alias"
              render={({ field }) => (
                <TagInput value={field.value} onChange={field.onChange} max={20} />
              )}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="排序" hint="同级展示顺序,越小越靠前" error={errors.sortOrder?.message}>
            <Input
              id="r-sort"
              type="number"
              min={0}
              max={9999}
              placeholder="0"
              aria-invalid={!!errors.sortOrder}
              {...register("sortOrder")}
            />
          </Field>
          <Field label="状态">
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <div className="flex h-9 w-full rounded-xl border border-input bg-card p-0.5 text-[13px]">
                  {([1, 0] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => field.onChange(v)}
                      className={cn(
                        "flex-1 cursor-pointer rounded-[9px] font-medium transition-colors",
                        field.value === v
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {STATUS_LABEL[v]}
                    </button>
                  ))}
                </div>
              )}
            />
          </Field>
        </div>
      </div>
    </>
  );
}

/* ───────────────────────── 小组件 ───────────────────────── */

/**
 * Label 右侧的 hover 提示图标(Field / MetaRow 共用):
 * info 小图标,hover 浮出 hint 文本,不常驻显示。
 */
function HintIcon({ hint }: { hint: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            tabIndex={-1}
            aria-label={hint}
            className="flex size-4 shrink-0 cursor-help items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none"
          />
        }
      >
        <Info className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent side="top" align="start" sideOffset={6}>
        <span className="block max-w-52 whitespace-normal text-left leading-relaxed">
          {hint}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * 字段行:Label + 提示图标 + 控件 + 错误。
 * hint 不常驻显示,改为 Label 右侧的 info 小图标,hover 时才浮出提示,
 * 避免表单里堆满说明文字。
 */
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
      <div className="flex items-center gap-1">
        <Label>{label}</Label>
        {hint && !error && <HintIcon hint={hint} />}
      </div>
      {children}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

function MetaRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex shrink-0 items-center gap-1">
        <span className="text-muted-foreground">{label}</span>
        {hint && <HintIcon hint={hint} />}
      </div>
      <div className="min-w-0 flex-1 break-all text-right font-mono text-[12.5px]">
        {children}
      </div>
    </div>
  );
}
