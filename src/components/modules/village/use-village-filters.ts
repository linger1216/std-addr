"use client";

import { createCrudFiltersStore } from "@/store/use-crud-filters";

export type VillageFilters = {
  q: string;
  regionId: string;
  status: "" | "0" | "1";
};

export const EMPTY_VILLAGE_FILTERS: VillageFilters = {
  q: "",
  regionId: "",
  status: "",
};

export const useVillageFilters = createCrudFiltersStore(EMPTY_VILLAGE_FILTERS);