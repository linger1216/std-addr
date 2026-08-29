"use client";

import { createQueryParamsStore } from "@/store/use-query-params";

export type LabelQueryParams = {
  q: string;
  status: "" | "0" | "1";
};

export const EMPTY_LABEL_QUERY_PARAMS: LabelQueryParams = {
  q: "",
  status: "",
};

export const useLabelQueryParams = createQueryParamsStore(EMPTY_LABEL_QUERY_PARAMS);