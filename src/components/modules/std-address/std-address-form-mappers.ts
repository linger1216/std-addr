/**
 * 标准地址库表单的纯数据映射(无 React 依赖,便于单元测试)。
 *
 * 职责:
 *  - StdAddressFormValues:提交形态(27 地址要素 + 基础字段;评分不在此列)
 *  - formSchema / EMPTY_FORM:表单值结构
 *  - toForm:详情 → 表单初值(Decimal 评分只读展示,不进表单值;要素 null → 空串)
 *  - toSubmit:表单值 → 提交值(要素空串 → null 清空)
 *
 * 评分是"自动评分"(由批量标准化流程计算),编辑表单只读展示,不提交。
 */

import { z } from "zod";

import {
  addressFieldsSchema,
  type StdAddressFieldKey,
} from "@/lib/validators/std-address";

/** 27 个地址要素值的提交形态 */
export type StdAddressFieldsSubmit = Record<
  StdAddressFieldKey,
  string | null
>;

/** 提交形态(评分由标准化自动计算,不提交) */
export type StdAddressFormValues = {
  id: string | null;
  rawAddress: string;
  stdAddress: string;
  status: 0 | 1;
} & StdAddressFieldsSubmit;

/**
 * 详情的最小结构(兼容 RouterOutputs 的 getById 输出)。
 * rawAddress 编辑时不可改(后端 update 不接收该字段),以只读展示。
 */
export type StdAddressDetailLike = {
  id: string;
  rawAddress: string;
  stdAddress: string | null;
  /** DB 是 Decimal,序列化后可能是 string/number;表单只读展示 */
  stdScore: unknown;
  status: number;
  /** 仅用于区分「详情」与「旧提交值」两个分支 */
  createdAt?: unknown;
} & Partial<Record<StdAddressFieldKey, string | null>>;

export const formSchema = z.object({
  id: z.string().nullable(),
  rawAddress: z
    .string()
    .trim()
    .min(1, "请输入原始地址")
    .max(500, "原始地址最长 500 字"),
  stdAddress: z.string().trim().max(500, "标准地址最长 500 字"),
  status: z.union([z.literal(0), z.literal(1)]),
  // 27 要素:表单值为 string,空串 = 未填写;提交时归一为 null
  ...addressFieldsSchema.shape,
});

export type FormSchema = z.infer<typeof formSchema>;

/** 空表单:要素全部空串 */
function emptyFields(): StdAddressFieldsSubmit {
  const out = {} as StdAddressFieldsSubmit;
  for (const key of Object.keys(addressFieldsSchema.shape) as StdAddressFieldKey[]) {
    out[key] = "";
  }
  return out;
}

export const EMPTY_FORM: FormSchema = {
  id: null,
  rawAddress: "",
  stdAddress: "",
  status: 1,
  ...emptyFields(),
};

export function toForm(
  initial: StdAddressDetailLike | StdAddressFormValues | null,
): FormSchema {
  if (!initial) return EMPTY_FORM;
  const fields = emptyFields();
  for (const key of Object.keys(fields) as StdAddressFieldKey[]) {
    const v = initial[key];
    fields[key] = typeof v === "string" ? v : "";
  }
  return {
    id: initial.id,
    rawAddress: initial.rawAddress,
    stdAddress: initial.stdAddress ?? "",
    status: initial.status === 1 ? 1 : 0,
    ...fields,
  };
}

export function toSubmit(values: FormSchema): StdAddressFormValues {
  const fields = {} as StdAddressFieldsSubmit;
  for (const key of Object.keys(emptyFields()) as StdAddressFieldKey[]) {
    const v = values[key];
    const trimmed = typeof v === "string" ? v.trim() : "";
    fields[key] = trimmed === "" ? null : trimmed;
  }
  return {
    id: values.id,
    rawAddress: values.rawAddress.trim(),
    stdAddress: values.stdAddress.trim(),
    status: values.status,
    ...fields,
  };
}

/** 评分(Decimal 兼容 string/number)→ 展示字符串;空 → 空串 */
export function formatScoreInput(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  if (Number.isNaN(n)) return "";
  return String(n);
}