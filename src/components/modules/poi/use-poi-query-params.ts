"use client";

import { createQueryParamsStore } from "@/store/use-query-params";

export type PoiQueryParams = {
  q: string;
  regionId: string;
  status: "" | "0" | "1";
};

export const EMPTY_POI_QUERY_PARAMS: PoiQueryParams = {
  q: "",
  regionId: "",
  status: "",
};

export const usePoiQueryParams = createQueryParamsStore(EMPTY_POI_QUERY_PARAMS);
