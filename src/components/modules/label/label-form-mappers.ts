/**
 * Label 表单的纯数据映射(无 React 依赖,便于单元测试)。
 * 对齐 community-form-mappers 模板;label 字段比 community 简单,无 region/alias/address。
 */

import { z } from "zod";

/** 表单值(提交形态) */
export type LabelFormValues = {
  id: string | null;
  name: string;
  label: string;
  status: 0 | 1;
};

/** 详情的最小结构(兼容 RouterOutputs 的 getById 输出) */
export type LabelDetailLike = {
  id: string;
  name: string;
  /** DB label 列允许 null,详情输出为 string | null;表单内收窄为 string(空串表示空) */
  label: string | null;
  /** DB 是 Int,详情输出为 number;表单内收窄为 0|1 */
  status: number;
  /** 仅用于区分「详情」与「旧提交值」两个分支 */
  createdAt?: unknown;
};

export const formSchema = z.object({
  id: z.string().nullable(),
  name: z.string().trim().min(1, "请输入名称").max(100, "名称最长 100 字"),
  label: z.string().trim().max(255, "标签最长 255 字"),
  status: z.union([z.literal(0), z.literal(1)]),
});

export type FormSchema = z.infer<typeof formSchema>;

export const EMPTY_FORM: FormSchema = {
  id: null,
  name: "",
  label: "",
  status: 1,
};

/** 详情 / 旧提交值 → 表单初值 */
export function toForm(
  initial: LabelDetailLike | LabelFormValues | null,
): FormSchema {
  if (!initial) return EMPTY_FORM;
  return {
    id: initial.id,
    name: initial.name,
    label: initial.label ?? "",
    status: initial.status === 0 ? 0 : 1,
  };
}

/** 表单 → 提交值:空白 label 保留(后端区分空 vs 未传) */
export function toSubmit(values: FormSchema): LabelFormValues {
  return {
    id: values.id,
    name: values.name.trim(),
    label: values.label.trim(),
    status: values.status,
  };
}