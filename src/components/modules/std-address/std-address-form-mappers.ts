/**
 * 标准地址库表单的纯数据映射(无 React 依赖,便于单元测试)。
 *
 * 职责:
 *  - StdAddressFormValues:提交形态(stdScore 为字符串,页面层转数字)
 *  - formSchema / EMPTY_FORM:表单值结构
 *  - toForm:详情 → 表单初值(Decimal 评分兼容 number/string)
 *  - toSubmit:表单值 → 提交值
 */

import { z } from "zod";

/** 表单值(提交形态:stdScore 为字符串,空串 = 不填) */
export type StdAddressFormValues = {
  id: string | null;
  rawAddress: string;
  stdAddress: string;
  stdScore: string;
  status: 0 | 1;
};

/**
 * 详情的最小结构(兼容 RouterOutputs 的 getById 输出)。
 * rawAddress 编辑时不可改(后端 update 不接收该字段),以只读展示。
 */
export type StdAddressDetailLike = {
  id: string;
  rawAddress: string;
  stdAddress: string | null;
  /** DB 是 Decimal,序列化后可能是 string/number */
  stdScore: unknown;
  status: number;
  /** 仅用于区分「详情」与「旧提交值」两个分支 */
  createdAt?: unknown;
};

export const formSchema = z.object({
  id: z.string().nullable(),
  rawAddress: z
    .string()
    .trim()
    .min(1, "请输入原始地址")
    .max(500, "原始地址最长 500 字"),
  stdAddress: z.string().trim().max(500, "标准地址最长 500 字"),
  // 评分以字符串编辑,空串 = 不填;提交时页面转数字
  stdScore: z
    .string()
    .trim()
    .refine((v) => v === "" || !Number.isNaN(Number(v)), "评分必须是数字")
    .refine(
      (v) => v === "" || (Number(v) >= 0 && Number(v) <= 10),
      "评分需在 0~10 之间",
    ),
  status: z.union([z.literal(0), z.literal(1)]),
});

export type FormSchema = z.infer<typeof formSchema>;

export const EMPTY_FORM: FormSchema = {
  id: null,
  rawAddress: "",
  stdAddress: "",
  stdScore: "",
  status: 1,
};

export function toForm(
  initial: StdAddressDetailLike | StdAddressFormValues | null,
): FormSchema {
  if (!initial) return EMPTY_FORM;
  return {
    id: initial.id,
    rawAddress: initial.rawAddress,
    stdAddress: initial.stdAddress ?? "",
    stdScore: formatScoreInput(initial.stdScore),
    status: initial.status === 1 ? 1 : 0,
  };
}

export function toSubmit(values: FormSchema): StdAddressFormValues {
  return {
    id: values.id,
    rawAddress: values.rawAddress.trim(),
    stdAddress: values.stdAddress.trim(),
    stdScore: values.stdScore.trim(),
    status: values.status,
  };
}

/** 评分 → 表单字符串:null/空 → "",Decimal 兼容 string/number → 去尾零 */
function formatScoreInput(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  if (Number.isNaN(n)) return "";
  return String(n);
}