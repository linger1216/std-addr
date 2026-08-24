"use client";

import { createCrudFiltersStore } from "@/store/use-crud-filters";

export type RoadFilters = {
  q: string;
  status: "" | "0" | "1";
};

export const EMPTY_ROAD_FILTERS: RoadFilters = {
  q: "",
  status: "",
};

export const useRoadFilters = createCrudFiltersStore(EMPTY_ROAD_FILTERS);