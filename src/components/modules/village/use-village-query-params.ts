"use client";

import { createQueryParamsStore } from "@/store/use-query-params";

export type VillageQueryParams = {
  q: string;
  regionId: string;
  status: "" | "0" | "1";
};

export const EMPTY_VILLAGE_QUERY_PARAMS: VillageQueryParams = {
  q: "",
  regionId: "",
  status: "",
};

export const useVillageQueryParams = createQueryParamsStore(EMPTY_VILLAGE_QUERY_PARAMS);
