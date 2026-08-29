/**
 * 村表单的纯数据映射(无 React 依赖,便于单元测试)。
 *
 * 与 community 表单差异:
 *   - 没有 address JSON 字段(村 schema 不含地址)
 *   - alias 是 JSON 列(对齐 community.alias),存为字符串数组;
 *     表单用 useFieldArray 编辑多条条目,提交时序列化成 JSON 数组
 *   - 其余(name/regionId/status)与 community 一致
 *
 * 职责:
 *  - VillageFormValues:提交形态(alias 为 JSON 文本字符串)
 *  - formSchema / EMPTY_FORM:表单 zod schema + 默认值
 *  - toForm:  详情/旧提交值 → 表单初值(多值 alias 拆成条目数组)
 *  - toSubmit:表单值 → 提交值(条目数组去空 → JSON 数组文本)
 */

import { z } from "zod";
import { parseAliasEntries } from "@/lib/alias-entries";

/** 表单值(提交形态:alias 为 JSON 文本字符串,例如 '["别名A","别名B"]') */
export type VillageFormValues = {
  id: string | null;
  name: string;
  alias: string;
  regionId: string;
  status: 0 | 1;
};

/** 详情的最小结构(兼容 RouterOutputs 的 getById 输出) */
export type VillageDetailLike = {
  id: string;
  name: string;
  /** alias 是 JSON 列,DB 输出 Prisma.JsonValue(类型上取 unknown) */
  alias: unknown;
  regionId: string | null;
  /** DB 是 Int,详情输出为 number;表单内收窄为 0|1 */
  status: number;
  /** 仅用于区分「详情」与「旧提交值」两个分支 */
  createdAt?: unknown;
};

export const formSchema = z.object({
  id: z.string().nullable(),
  name: z.string().trim().min(1, "请输入村名称").max(100, "名称最长 100 字"),
  // alias 是 JSON 数组,表单内是条目数组(TagInput 控 20 条上限)
  // 每条单独校验;提交时 toSubmit 去空 + JSON.stringify
  alias: z.array(z.object({ value: z.string().max(100, "别名最长 100 字") })),
  regionId: z.string(),
  status: z.union([z.literal(0), z.literal(1)]),
});

export type FormSchema = z.infer<typeof formSchema>;

export const EMPTY_FORM: FormSchema = {
  id: null,
  name: "",
  alias: [],
  regionId: "",
  status: 1,
};

/** 详情 / 旧提交值 → 表单初值(别名 JSON 解析成条目数组) */
export function toForm(
  initial: VillageDetailLike | VillageFormValues | null,
): FormSchema {
  const toEntries = (v: unknown) =>
    parseAliasEntries(v).map((s) => ({ value: s }));
  if (!initial) return EMPTY_FORM;
  if ("createdAt" in initial) {
    return {
      id: initial.id,
      name: initial.name,
      // alias 是 JSON 数组列,统一走 parseAliasEntries 归一(支持字符串/数组/JSON 字符串)
      alias: toEntries(initial.alias),
      regionId: initial.regionId ?? "",
      status: initial.status === 0 ? 0 : 1,
    };
  }
  return {
    id: initial.id,
    name: initial.name,
    alias: toEntries(initial.alias),
    regionId: initial.regionId ?? "",
    status: initial.status === 0 ? 0 : 1,
  };
}

/** 表单 → 提交值:条目去空 + JSON 序列化(空列表 → "[]") */
export function toSubmit(values: FormSchema): VillageFormValues {
  return {
    id: values.id,
    name: values.name.trim(),
    alias: JSON.stringify(
      values.alias.map((a) => a.value.trim()).filter((s) => s.length > 0),
    ),
    regionId: values.regionId,
    status: values.status,
  };
}
