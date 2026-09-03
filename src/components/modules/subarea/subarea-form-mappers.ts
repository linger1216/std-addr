/**
 * 子区域表单的纯数据映射(无 React 依赖,便于单元测试)。
 *
 * 职责:
 *  - SubareaFormValues:提交形态(alias/address 为 JSON 文本,property 为 JSON 对象,由 toSubmit 自动生成)
 *  - formSchema / EMPTY_FORM:表单值结构(地址/别名是条目数组,属性是 key+值条目,提交时才序列化)
 *  - toForm:  详情/旧提交值 → 表单初值(JSON 解析成条目数组)
 *  - toSubmit:表单值 → 提交值(条目去空后序列化成 JSON)
 *
 * property 表单形态:
 *   [{ key: "building", values: [{ value: "1" }, { value: "A" }] }, ...]
 *   提交时 → { building: ["1", "A"] }(key/空值过滤)
 */

import { z } from "zod";

import { parseAddressEntries } from "@/lib/format";
import { parseAliasEntries } from "@/lib/alias-entries";

/** 表单值(提交形态:alias/address 为 JSON 文本,property 为 JSON 对象文本,由列表编辑器自动生成) */
export type SubareaFormValues = {
  id: string | null;
  name: string;
  /** JSON 文本(数组),用户无感知 */
  alias: string;
  regionId: string;
  /** 关联实体类型:community/village/poi,空串 = 未关联 */
  entityType?: string;
  /** 关联实体 id(entity_id 实际是 小区/村/POI 的主键),空串 = 未关联 */
  entityId?: string;
  status: 0 | 1;
  /** JSON 文本(数组),用户无感知 */
  address: string;
  /** JSON 文本(对象),用户无感知 */
  property: string;
};

/**
 * 详情的最小结构(兼容 RouterOutputs 的 getById 输出)。
 * alias/address/property 是数据库 JSON 列,类型上取 unknown。
 */
export type SubareaDetailLike = {
  id: string;
  name: string;
  alias: unknown;
  regionId: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** DB 是 Int,详情输出为 number;表单内收窄为 0|1 */
  status: number;
  address: unknown;
  property: unknown;
  /** 仅用于区分「详情」与「旧提交值」两个分支 */
  createdAt?: unknown;
};

export const formSchema = z.object({
  id: z.string().nullable(),
  name: z.string().trim().min(1, "请输入子区域名称").max(100, "名称最长 100 字"),
  // alias 多值:TagInput 控制 20 条上限;每条限长 100
  alias: z.array(z.object({ value: z.string().max(100, "别名最长 100 字") })),
  regionId: z.string(),
  /** 关联实体类型:community/village/poi;空串/缺省 = 未关联 */
  entityType: z.string().optional(),
  /** 关联实体 id;空串/缺省 = 未关联(与 entityType 成对) */
  entityId: z.string().optional(),
  status: z.union([z.literal(0), z.literal(1)]),
  // 表单内是地址条目数组(每条一个 Input),提交时才序列化成 JSON。
  // 条目用 { value } 对象形态 —— RHF 的 useFieldArray 不支持元素为原始类型的数组
  address: z.array(z.object({ value: z.string() })),
  // 属性:key + 值条目数组
  property: z.array(
    z.object({
      key: z.string().trim().max(50, "属性名最长 50 字"),
      values: z.array(z.object({ value: z.string().max(100) })),
    }),
  ),
});

export type FormSchema = z.infer<typeof formSchema>;

export const EMPTY_FORM: FormSchema = {
  id: null,
  name: "",
  alias: [],
  regionId: "",
  entityType: "",
  entityId: "",
  status: 1,
  address: [],
  property: [],
};

/** 详情 → 表单初值(alias/address JSON 解析成条目数组;property 对象 → key+值条目) */
export function toForm(
  initial: SubareaDetailLike | SubareaFormValues | null,
): FormSchema {
  const toAddrEntries = (v: unknown) =>
    parseAddressEntries(v).map((s) => ({ value: s }));
  const toAliasEntries = (v: unknown) =>
    parseAliasEntries(v).map((s) => ({ value: s }));
  const toPropertyEntries = (v: unknown) => {
    // 兼容:提交形态是 JSON 文本,详情形态是对象
    let obj: unknown = v;
    if (typeof v === "string") {
      try {
        obj = JSON.parse(v);
      } catch {
        obj = null;
      }
    }
    if (obj == null || typeof obj !== "object" || Array.isArray(obj)) return [];
    return Object.entries(obj as Record<string, unknown>)
      .filter(([k]) => k.trim() !== "")
      .map(([k, raw]) => {
        const list = Array.isArray(raw) ? raw : [raw];
        return {
          key: k,
          values: list
            .map((x) => (x == null ? "" : String(x)))
            .filter((s) => s.trim() !== "")
            .map((s) => ({ value: s })),
        };
      });
  };
  if (!initial) return EMPTY_FORM;
  return {
    id: initial.id,
    name: initial.name,
    alias: toAliasEntries(initial.alias),
    regionId: initial.regionId ?? "",
    entityType: initial.entityType ?? "",
    entityId: initial.entityId ?? "",
    status: initial.status === 0 ? 0 : 1,
    address: toAddrEntries(initial.address),
    property: toPropertyEntries(initial.property),
  };
}

/** 表单 → 提交值:条目去空后序列化成 JSON(空列表 → "[]";属性空对象 → "{}") */
export function toSubmit(values: FormSchema): SubareaFormValues {
  const serialize = (entries: { value: string }[]) =>
    JSON.stringify(
      entries.map((a) => a.value.trim()).filter((s) => s.length > 0),
    );
  // 属性:key 去空,值去空;空 key 或空值整行丢弃
  const propertyObj = Object.fromEntries(
    values.property
      .map((p) => ({
        key: p.key.trim(),
        list: p.values
          .map((x) => x.value.trim())
          .filter((s) => s.length > 0),
      }))
      .filter((p) => p.key !== "" && p.list.length > 0)
      .map((p) => [p.key, p.list]),
  );
  return {
    id: values.id,
    name: values.name.trim(),
    alias: serialize(values.alias),
    regionId: values.regionId,
    // 实体成对提交:trim 后仍为空串 = 未关联(路由层把 "" 归 null;
    // 页面提交时不传 undefined,保证编辑时"清空关联"能真正落库)
    entityType: (values.entityType ?? "").trim(),
    entityId: (values.entityId ?? "").trim(),
    status: values.status,
    address: serialize(values.address),
    property: JSON.stringify(propertyObj),
  };
}