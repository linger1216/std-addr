"use client";

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

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
import { Textarea } from "@/components/ui/textarea";
import { SearchSelect } from "@/components/ui/search-select";
import type { RegionOption } from "./community-toolbar";
import type { RouterOutputs } from "@/trpc/react";

/** 详情类型 = getById 输出(单一事实来源) */
export type CommunityDetail = NonNullable<
  RouterOutputs["community"]["getById"]
>;

/** 表单值(字符串形态,提交时再解析 JSON) */
export type CommunityFormValues = {
  id: string | null;
  name: string;
  alias: string;
  regionId: string;
  status: 0 | 1;
  address: string; // JSON 文本
};

/** JSON 字符串校验:空串 OK,非空必须可解析 */
const jsonString = z
  .string()
  .refine(
    (v) => !v.trim() || (() => {
      try {
        JSON.parse(v);
        return true;
      } catch {
        return false;
      }
    })(),
    { message: "不是合法 JSON" },
  );

const formSchema = z.object({
  id: z.string().nullable(),
  name: z.string().trim().min(1, "请输入小区名称").max(100, "名称最长 100 字"),
  alias: z.string().trim().max(100, "别名最长 100 字"),
  regionId: z.string(),
  status: z.union([z.literal(0), z.literal(1)]),
  address: jsonString,
});

type FormSchema = z.infer<typeof formSchema>;

const EMPTY: FormSchema = {
  id: null,
  name: "",
  alias: "",
  regionId: "",
  status: 1,
  address: "",
};

/** 详情 → 表单初值(JSON 字段 stringify 回文本) */
function toForm(initial: CommunityDetail | CommunityFormValues | null): FormSchema {
  if (!initial) return EMPTY;
  if ("createdAt" in initial) {
    return {
      id: initial.id,
      name: initial.name,
      alias: initial.alias ?? "",
      regionId: initial.regionId ?? "",
      status: initial.status === 0 ? 0 : 1,
      address: initial.address ? JSON.stringify(initial.address, null, 2) : "",
    };
  }
  return { ...EMPTY, ...initial };
}

/** 表单 → 提交值(去掉 trim + 转换 id) */
function toSubmit(values: FormSchema): CommunityFormValues {
  return {
    id: values.id,
    name: values.name.trim(),
    alias: values.alias.trim(),
    regionId: values.regionId,
    status: values.status,
    address: values.address,
  };
}

export function CommunityFormDialog({
  open,
  onOpenChange,
  initial,
  regions,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  initial: CommunityDetail | CommunityFormValues | null;
  regions: RegionOption[];
  onSubmit: (values: CommunityFormValues) => void;
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
    defaultValues: EMPTY,
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
          <DialogTitle>{isEdit ? "编辑小区" : "新建小区"}</DialogTitle>
          <DialogDescription>
            维护住宅小区的基本资料与区划归属。
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
            <Field label="别名" error={errors.alias?.message}>
              <Input
                id="c-alias"
                placeholder="可留空"
                aria-invalid={!!errors.alias}
                {...register("alias")}
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
            label="address (JSON 字符串)"
            hint="留空表示不修改,非空必须是合法 JSON"
            error={errors.address?.message}
          >
            <Textarea
              id="c-address"
              placeholder='例如:{"province":"北京","city":"北京","district":"朝阳区"}'
              aria-invalid={!!errors.address}
              className="min-h-20 font-mono text-[12px]"
              {...register("address")}
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