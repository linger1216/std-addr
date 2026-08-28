/**
 * 道路表单的纯数据映射(无 React 依赖,便于单元测试)。
 * 对齐 community-form-mappers 模板;道路只有 road/status 两个业务字段。
 */

import { z } from "zod";

/** 表单值(提交形态) */
export type RoadFormValues = {
  id: string | null;
  road: string;
  status: 0 | 1;
};

/** 详情的最小结构(兼容 RouterOutputs 的 getById 输出) */
export type RoadDetailLike = {
  id: string;
  road: string;
  /** DB 是 Int,详情输出为 number;表单内收窄为 0|1 */
  status: number;
  /** 仅用于区分「详情」与「旧提交值」两个分支 */
  createdAt?: unknown;
};

export const formSchema = z.object({
  id: z.string().nullable(),
  road: z.string().trim().min(1, "请输入道路名").max(100, "名称最长 100 字"),
  status: z.union([z.literal(0), z.literal(1)]),
});

export type FormSchema = z.infer<typeof formSchema>;

export const EMPTY_FORM: FormSchema = {
  id: null,
  road: "",
  status: 1,
};

/** 详情 / 旧提交值 → 表单初值 */
export function toForm(
  initial: RoadDetailLike | RoadFormValues | null,
): FormSchema {
  if (!initial) return EMPTY_FORM;
  return {
    id: initial.id,
    road: initial.road,
    status: initial.status === 0 ? 0 : 1,
  };
}

/** 表单 → 提交值 */
export function toSubmit(values: FormSchema): RoadFormValues {
  return {
    id: values.id,
    road: values.road.trim(),
    status: values.status,
  };
}