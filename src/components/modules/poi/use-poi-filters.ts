"use client";

import { createCrudFiltersStore } from "@/store/use-crud-filters";

export type PoiFilters = {
  q: string;
  regionId: string;
  status: "" | "0" | "1";
};

export const EMPTY_POI_FILTERS: PoiFilters = {
  q: "",
  regionId: "",
  status: "",
};

export const usePoiFilters = createCrudFiltersStore(EMPTY_POI_FILTERS);