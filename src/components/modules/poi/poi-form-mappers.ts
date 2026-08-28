/**
 * POI 表单的纯数据映射(无 React 依赖,便于单元测试)。
 *
 * 与 community 表单差异:
 *   - 多一个 type(类型)字段
 *   - alias 是 JSON 数组列(AliasTagInput 编辑),address 是地址列表(useFieldArray 编辑)
 *   - 其余(name/regionId/status)与 community 一致
 *
 * 职责:
 *  - PoiFormValues:提交形态(alias/address 为 JSON 文本)
 *  - formSchema / EMPTY_FORM:表单 zod schema + 默认值
 *  - toForm:  详情/旧提交值 → 表单初值
 *  - toSubmit:表单值 → 提交值(去空 + JSON 序列化)
 */

import { z } from "zod";
import { parseAliasEntries } from "@/lib/alias-entries";
import { parseAddressEntries } from "@/lib/format";

/** 表单值(提交形态:alias/address 为 JSON 文本字符串) */
export type PoiFormValues = {
  id: string | null;
  name: string;
  type: string;
  /** JSON 文本(数组),用户无感知 */
  alias: string;
  regionId: string;
  status: 0 | 1;
  /** JSON 文本(数组),用户无感知 */
  address: string;
};

/** 详情的最小结构(兼容 RouterOutputs 的 getById 输出) */
export type PoiDetailLike = {
  id: string;
  name: string;
  type: string | null;
  /** alias/address 是 JSON 列,DB 输出 Prisma.JsonValue(类型上取 unknown) */
  alias: unknown;
  regionId: string | null;
  status: number;
  address: unknown;
  /** 仅用于区分「详情」与「旧提交值」两个分支 */
  createdAt?: unknown;
};

export const formSchema = z.object({
  id: z.string().nullable(),
  name: z.string().trim().min(1, "请输入 POI 名称").max(100, "名称最长 100 字"),
  type: z.string().trim().max(50, "类型最长 50 字"),
  // alias 多值:AliasTagInput 控 20 条上限;每条限长 100
  alias: z.array(z.object({ value: z.string().max(100, "别名最长 100 字") })),
  regionId: z.string(),
  status: z.union([z.literal(0), z.literal(1)]),
  // address 地址列表:useFieldArray 条目,提交时才序列化
  address: z.array(z.object({ value: z.string().max(200, "地址最长 200 字") })),
});

export type FormSchema = z.infer<typeof formSchema>;

export const EMPTY_FORM: FormSchema = {
  id: null,
  name: "",
  type: "",
  alias: [],
  regionId: "",
  status: 1,
  address: [],
};

/** 详情 / 旧提交值 → 表单初值(条目数组) */
export function toForm(
  initial: PoiDetailLike | PoiFormValues | null,
): FormSchema {
  const toAliasEntries = (v: unknown) =>
    parseAliasEntries(v).map((s) => ({ value: s }));
  const toAddrEntries = (v: unknown) =>
    parseAddressEntries(v).map((s) => ({ value: s }));
  if (!initial) return EMPTY_FORM;
  return {
    id: initial.id,
    name: initial.name,
    type: typeof initial.type === "string" ? initial.type : "",
    alias: toAliasEntries(initial.alias),
    regionId: typeof initial.regionId === "string" ? initial.regionId : "",
    status: initial.status === 0 ? 0 : 1,
    address: toAddrEntries(initial.address),
  };
}

/** 表单 → 提交值:条目去空后序列化成 JSON 文本(空列表 → "[]") */
export function toSubmit(values: FormSchema): PoiFormValues {
  const serialize = (entries: { value: string }[]) =>
    JSON.stringify(
      entries.map((a) => a.value.trim()).filter((s) => s.length > 0),
    );
  return {
    id: values.id,
    name: values.name.trim(),
    type: values.type.trim(),
    alias: serialize(values.alias),
    regionId: values.regionId,
    status: values.status,
    address: serialize(values.address),
  };
}