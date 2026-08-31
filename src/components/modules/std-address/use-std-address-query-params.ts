/**
 * 标准地址库查询参数 store —— 沿用 createQueryParamsStore 工厂(与 community/road/poi/village 同一套)。
 * 字段全部以 string 形态保存,空串代表"未筛选"。
 */

"use client";

import { createQueryParamsStore } from "@/store/use-query-params";

export type StdAddressQueryParams = {
  q: string;
  status: "" | "0" | "1";
};

export const EMPTY_STD_ADDRESS_QUERY_PARAMS: StdAddressQueryParams = {
  q: "",
  status: "",
};

export const useStdAddressQueryParams = createQueryParamsStore(
  EMPTY_STD_ADDRESS_QUERY_PARAMS,
);