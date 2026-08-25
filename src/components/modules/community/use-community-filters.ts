/**
 * 小区筛选 store —— 沿用 createCrudFiltersStore 工厂(与 road/poi/village 同一套)。
 * 字段全部以 string 形态保存,空串代表"未筛选"。
 */

"use client";

import { createCrudFiltersStore } from "@/store/use-crud-filters";

export type CommunityFilters = {
  q: string;
  regionId: string;
  status: "" | "0" | "1";
};

export const EMPTY_COMMUNITY_FILTERS: CommunityFilters = {
  q: "",
  regionId: "",
  status: "",
};

export const useCommunityFilters = createCrudFiltersStore(EMPTY_COMMUNITY_FILTERS);