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