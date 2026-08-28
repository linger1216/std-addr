"use client";

import { createQueryParamsStore } from "@/store/use-query-params";

export type RoadQueryParams = {
  q: string;
  status: "" | "0" | "1";
};

export const EMPTY_ROAD_QUERY_PARAMS: RoadQueryParams = {
  q: "",
  status: "",
};

export const useRoadQueryParams = createQueryParamsStore(EMPTY_ROAD_QUERY_PARAMS);
