/**
 * 菜单表单的纯数据映射(无 React 依赖,便于单元测试)。
 *
 * 职责:
 *  - MenusFormValues:提交形态(对齐 router.menu.create input)
 *  - formSchema:表单值结构(RHF 用)
 *  - toForm:  详情 / 编辑入参 → 表单初值
 *  - toSubmit:表单值 → 提交值(归一 path/parentId 的空串为 null 等)
 */

import { z } from "zod";

/**
 * 图标名:
 *  - 空串 = 未选择(提交时 toSubmit 归一为 null)
 *  - 非空:不硬校验必须在 lucide 集合内 —— 兼容历史遗留的旧版图标名
 *    (如 bar-chart),未知名字由 LucideIcon 组件兜底渲染占位,不阻塞保存。
 */
const lucideIconSchema = z.string().max(60, "图标名最长 60 字");

/** 提交形态 —— 路由层 menu.create/update 入参 */
export type MenusFormValues = {
  id: string | null;
  name: string;
  path: string;
  icon: string;
  sort: number;
  visible: boolean;
  parentId: string;
};

/** 详情 / 旧提交值的最小结构 */
export type MenuDetailLike = {
  id: string;
  name: string;
  path: string | null;
  icon: string | null;
  sort: number;
  visible: boolean;
  parentId: string | null;
  createdAt?: unknown;
};

/** 表单用的 zod schema(RHF + zodResolver 校验) */
export const formSchema = z.object({
  id: z.string().nullable(),
  name: z.string().trim().min(1, "请输入菜单名称").max(100, "名称最长 100 字"),
  /**
   * 路径:父菜单可留空;叶菜单(/users)必须以 / 开头。
   * 也允许任意字符串,这里做最宽校验,具体规则由业务决定。
   */
  path: z.string().max(200, "路径最长 200 字"),
  icon: lucideIconSchema,
  sort: z.number().int("排序必须为整数"),
  visible: z.boolean(),
  /**
   * parentId:空串 = "顶级菜单" 表单语义,提交时归一为 null。
   * 严格说不要让用户把自己设为自己的父级(form 打开时已过滤自身和子树)。
   */
  parentId: z.string(),
});

export const EMPTY_FORM: Omit<MenusFormValues, "id"> = {
  name: "",
  path: "",
  icon: "",
  sort: 0,
  visible: true,
  parentId: "",
};

/**
 * 详情(或旧提交值) → 表单初值。
 * - 路由层 icon 是 string | null,表单允许空串(理解为"未选图标")。
 * - parentId 同理。
 */
export function toForm(detail: MenuDetailLike | MenusFormValues | null): MenusFormValues & {
  id: string | null;
} {
  if (!detail) return { id: null, ...EMPTY_FORM };
  return {
    id: detail.id ?? null,
    name: detail.name ?? "",
    path: detail.path ?? "",
    icon: detail.icon ?? "",
    sort: detail.sort ?? 0,
    visible: detail.visible ?? true,
    parentId: detail.parentId ?? "",
  };
}

/** 表单值 → 提交值 */
export function toSubmit(values: MenusFormValues & { id: string | null }): {
  id?: string;
  name: string;
  path: string | null;
  icon: string | null;
  sort: number;
  visible: boolean;
  parentId: string | null;
} {
  const path = values.path.trim();
  const icon = values.icon.trim();
  const parentId = values.parentId.trim();
  return {
    id: values.id ?? undefined,
    name: values.name.trim(),
    path: path === "" ? null : path,
    icon: icon === "" ? null : icon,
    sort: values.sort,
    visible: values.visible,
    parentId: parentId === "" ? null : parentId,
  };
}
