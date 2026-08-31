/**
 * 菜单查询参数 store —— 用 createQueryParamsStore 工厂。
 *
 * 菜单管理页只需要按名称模糊搜索,不需要 region / status 之类筛选。
 * `q` 是字符串,空串 = "全部"。
 */

"use client";

import { createQueryParamsStore } from "@/store/use-query-params";

export type MenusQueryParams = {
  q: string;
};

export const EMPTY_MENUS_QUERY_PARAMS: MenusQueryParams = {
  q: "",
};

export const useMenusQueryParams = createQueryParamsStore(EMPTY_MENUS_QUERY_PARAMS);
