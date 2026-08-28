/**
 * 小区查询参数 store —— 沿用 createQueryParamsStore 工厂(与 road/poi/village 同一套)。
 * 字段全部以 string 形态保存,空串代表"未筛选"。
 */

"use client";

import { createQueryParamsStore } from "@/store/use-query-params";

export type CommunityQueryParams = {
  q: string;
  regionId: string;
  status: "" | "0" | "1";
};

export const EMPTY_COMMUNITY_QUERY_PARAMS: CommunityQueryParams = {
  q: "",
  regionId: "",
  status: "",
};

export const useCommunityQueryParams = createQueryParamsStore(EMPTY_COMMUNITY_QUERY_PARAMS);
