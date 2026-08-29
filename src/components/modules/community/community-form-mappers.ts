/**
 * 小区表单的纯数据映射(无 React 依赖,便于单元测试)。
 *
 * 职责:
 *  - CommunityFormValues:提交形态(alias/address 为 JSON 文本,由 toSubmit 自动生成)
 *  - formSchema / EMPTY_FORM:表单值结构(地址/别名是条目数组,提交时才序列化)
 *  - toForm:  详情/旧提交值 → 表单初值(JSON 解析成条目数组)
 *  - toSubmit:表单值 → 提交值(条目去空后序列化成 JSON 文本)
 *
 * 改动:alias 由单字符串升级为多值 JSON 数组(对齐 village.alias),
 * 与 community.address 共用同一套"条目数组 → JSON 序列化"模式。
 */

import { z } from "zod";

import { parseAddressEntries } from "@/lib/format";
import { parseAliasEntries } from "@/lib/alias-entries";

/** 表单值(提交形态:alias/address 为 JSON 文本,由列表编辑器自动生成) */
export type CommunityFormValues = {
  id: string | null;
  name: string;
  /** JSON 文本(数组),用户无感知 */
  alias: string;
  regionId: string;
  status: 0 | 1;
  /** JSON 文本(数组),用户无感知 */
  address: string;
};

/**
 * 详情的最小结构(兼容 RouterOutputs 的 getById 输出)。
 * alias/address 是数据库 JSON 列,类型上取 unknown。
 */
export type CommunityDetailLike = {
  id: string;
  name: string;
  alias: unknown;
  regionId: string | null;
  /** DB 是 Int,详情输出为 number;表单内收窄为 0|1 */
  status: number;
  address: unknown;
  /** 仅用于区分「详情」与「旧提交值」两个分支 */
  createdAt?: unknown;
};

export const formSchema = z.object({
  id: z.string().nullable(),
  name: z.string().trim().min(1, "请输入小区名称").max(100, "名称最长 100 字"),
  // alias 多值:TagInput 控制 20 条上限;每条限长 100
  alias: z.array(z.object({ value: z.string().max(100, "别名最长 100 字") })),
  regionId: z.string(),
  status: z.union([z.literal(0), z.literal(1)]),
  // 表单内是地址条目数组(每条一个 Input),提交时才序列化成 JSON。
  // 条目用 { value } 对象形态 —— RHF 的 useFieldArray 不支持元素为原始类型的数组
  address: z.array(z.object({ value: z.string() })),
});

export type FormSchema = z.infer<typeof formSchema>;

export const EMPTY_FORM: FormSchema = {
  id: null,
  name: "",
  alias: [],
  regionId: "",
  status: 1,
  address: [],
};

/** 详情 → 表单初值(alias/address JSON 解析成条目数组)。导出供单测 */
export function toForm(
  initial: CommunityDetailLike | CommunityFormValues | null,
): FormSchema {
  const toAddrEntries = (v: unknown) =>
    parseAddressEntries(v).map((s) => ({ value: s }));
  const toAliasEntries = (v: unknown) =>
    parseAliasEntries(v).map((s) => ({ value: s }));
  if (!initial) return EMPTY_FORM;
  if ("createdAt" in initial) {
    return {
      id: initial.id,
      name: initial.name,
      alias: toAliasEntries(initial.alias),
      regionId: initial.regionId ?? "",
      status: initial.status === 0 ? 0 : 1,
      address: toAddrEntries(initial.address),
    };
  }
  return {
    id: initial.id,
    name: initial.name,
    alias: toAliasEntries(initial.alias),
    regionId: initial.regionId ?? "",
    status: initial.status === 0 ? 0 : 1,
    address: toAddrEntries(initial.address),
  };
}

/** 表单 → 提交值:条目去空后序列化成 JSON 文本(空列表 → "[]")。导出供单测 */
export function toSubmit(values: FormSchema): CommunityFormValues {
  const serialize = (entries: { value: string }[]) =>
    JSON.stringify(
      entries.map((a) => a.value.trim()).filter((s) => s.length > 0),
    );
  return {
    id: values.id,
    name: values.name.trim(),
    alias: serialize(values.alias),
    regionId: values.regionId,
    status: values.status,
    address: serialize(values.address),
  };
}