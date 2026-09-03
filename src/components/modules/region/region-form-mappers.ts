import { z } from "zod";

import type { RouterOutputs } from "@/trpc/react";
import { STATUS } from "@/lib/constants";
import { REGION_TYPES } from "@/lib/region-import";
import { parseAliasEntries } from "@/lib/alias-entries";
import { findNodeByCode } from "./region-tree-utils";

/** 树数据 = region.list 输出(单一事实来源) */
export type RegionTreeNode = RouterOutputs["region"]["list"][number];

/**
 * 行政区划表单 —— 纯数据映射(toForm/toSubmit/schema),独立成模块便于单测。
 * 对齐后端 regionCreateSchema / regionUpdateSchema(见 lib/validators/region.ts)。
 */

export const regionFormSchema = z.object({
  name: z.string().trim().min(1, "名称不能为空").max(100, "名称最长 100 字"),
  code: z
    .string()
    .trim()
    .min(1, "编码不能为空")
    .max(50, "编码最长 50 字"),
  /** 区划类型(省/市/区/街道/镇/居(村)委会…),可留空 */
  type: z.string().trim().max(50, "类型最长 50 字").optional(),
  /** 别名 / 别称(曾用名,多值;TagInput 控制 20 条上限,每条限长 100) */
  alias: z.array(z.object({ value: z.string().max(100, "别名最长 100 字") })),
  /** 上级编码;"" = 顶级(与 SearchSelect 空值约定一致) */
  parentCode: z.string().optional(),
  /** 排序,数字字符串(Input type=number) */
  sortOrder: z
    .string()
    .trim()
    .regex(/^\d{0,4}$/, "排序为 0-9999 的整数")
    .optional(),
  status: z.union([z.literal(0), z.literal(1)]),
});

export type RegionFormSchema = z.infer<typeof regionFormSchema>;

/** 提交值(与后端 create/update input 对齐) */
export type RegionFormValues = {
  name: string;
  code: string;
  type?: string;
  /** 别名 / 别称(JSON 文本,用户无感知;空列表 = "[]") */
  alias: string;
  /** ""/undefined → 顶级 */
  parentCode?: string;
  sortOrder: number;
  status: 0 | 1;
};

/** 节点 → 表单值;null = 新建默认值 */
export function toForm(node: RegionTreeNode | null | undefined): RegionFormSchema {
  return {
    name: node?.name ?? "",
    code: node?.code ?? "",
    type: node?.type ?? "",
    alias: parseAliasEntries(node?.alias).map((s) => ({ value: s })),
    parentCode: node?.parentCode ?? "",
    sortOrder: String(node?.sortOrder ?? 0),
    status: node?.status === STATUS.DISABLED ? STATUS.DISABLED : STATUS.ENABLED,
  };
}

/** 空串/空白 → undefined;否则返回 trim 后的值 */
function trimToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** 类型下拉选项:预设 + 当前值(编辑旧数据时兜底,避免显示 placeholder) */
export function regionTypeOptions(current: string | undefined): string[] {
  const set = new Set<string>(REGION_TYPES);
  if (current && current.trim() !== "") set.add(current.trim());
  return [...set];
}

/** 表单值 → 提交值(空串归一、数字转换、别名序列化为 JSON 文本) */
export function toSubmit(values: RegionFormSchema): RegionFormValues {
  return {
    name: values.name.trim(),
    code: values.code.trim(),
    type: trimToUndefined(values.type),
    // 别名条目去空后序列化成 JSON 文本(空列表 → "[]",路由层转 JsonNull)
    alias: JSON.stringify(
      values.alias.map((a) => a.value.trim()).filter((s) => s.length > 0),
    ),
    parentCode: trimToUndefined(values.parentCode),
    sortOrder: Number(values.sortOrder ?? 0),
    status: values.status,
  };
}

/** 把树压平成下拉选项(排除自身与后代,用于上级选择) */
export function flattenParentOptions(
  nodes: RegionTreeNode[],
  excludeCode?: string,
  excludeDescendants = true,
): Array<{ value: string; label: string }> {
  const excluded = new Set<string>();
  if (excludeCode !== undefined) {
    const target = findNodeByCode(nodes, excludeCode);
    if (target) {
      excluded.add(target.code);
      if (excludeDescendants) {
        const collect = (n: RegionTreeNode) => {
          for (const c of n.children) {
            excluded.add(c.code);
            collect(c);
          }
        };
        collect(target);
      }
    }
  }

  const options: Array<{ value: string; label: string }> = [];
  const walk = (list: RegionTreeNode[]) => {
    for (const n of list) {
      if (!excluded.has(n.code)) {
        options.push({
          value: n.code,
          label: n.fullName ?? n.name,
        });
      }
      walk(n.children);
    }
  };
  walk(nodes);
  return options;
}
