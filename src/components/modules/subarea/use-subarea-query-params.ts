/**
 * 子区域查询参数 store —— 沿用 createQueryParamsStore 工厂(与 road/poi/village 同一套)。
 * 字段全部以 string 形态保存,空串代表"未筛选"。
 */

"use client";

import { createQueryParamsStore } from "@/store/use-query-params";

export type SubareaQueryParams = {
  q: string;
  regionId: string;
  status: "" | "0" | "1";
};

export const EMPTY_COMMUNITY_QUERY_PARAMS: SubareaQueryParams = {
  q: "",
  regionId: "",
  status: "",
};

export const useSubareaQueryParams = createQueryParamsStore(EMPTY_COMMUNITY_QUERY_PARAMS);
