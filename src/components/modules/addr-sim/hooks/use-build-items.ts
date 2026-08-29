/**
 * 生成参数共享 hook —— generate-card 与 export-dialog 复用同一套
 * "选中启用规则 + 比例校验 + 条数换算 + 生成"逻辑,避免两处漂移。
 */
"use client";

import { useMemo } from "react";

import {
  computeCountsByRatios,
  generateForRules,
  shuffleArray,
  type CandidatePool,
  type LabelStudioItem,
} from "@/lib/addr-sim/generator";
import type { AddrSimRuleRow } from "../addr-sim-rule-editor";

/** 规则 id → 占比(0~100),由 store.ratios 提供 */
export type RatioMap = Record<string, number>;

export interface UseBuildItemsOptions {
  rules: AddrSimRuleRow[];
  selectedIds: string[];
  candidates: CandidatePool;
  totalCount: number;
  ratios: RatioMap;
}

export function useBuildItems(opts: UseBuildItemsOptions) {
  const { rules, selectedIds, candidates, totalCount, ratios } = opts;

  /** 选中且启用的规则(按勾选顺序稳定输出) */
  const selectedRules = useMemo(
    () =>
      rules
        .filter((r) => r.status !== 0)
        .filter((r) => selectedIds.includes(r.id))
        .sort((a, b) => selectedIds.indexOf(a.id) - selectedIds.indexOf(b.id)),
    [rules, selectedIds],
  );

  /** 已选规则占比合计 */
  const totalPct = useMemo(
    () => selectedRules.reduce((sum, r) => sum + (ratios[r.id] ?? 0), 0),
    [selectedRules, ratios],
  );

  /** 可用于生成/导出的前提:至少一条规则且比例合计 100% */
  const valid = selectedRules.length > 0 && totalPct === 100;

  /** 按比例换算条数(向下取整 + 余数并入第一条) */
  const counts = useMemo(
    () =>
      computeCountsByRatios(
        selectedRules.map((r) => ({ id: r.id, ratio: ratios[r.id] ?? 0 })),
        totalCount,
      ),
    [selectedRules, ratios, totalCount],
  );

  /**
   * 生成指定条数(预览用少量,导出用总量);
   * 条数换算与 counts 同源(小总量同样做余数校正)。
   */
  function buildItems(count: number, shuffle = false): LabelStudioItem[] {
    const scale =
      count === totalCount
        ? counts
        : computeCountsByRatios(
            selectedRules.map((r) => ({ id: r.id, ratio: ratios[r.id] ?? 0 })),
            count,
          );
    const items = generateForRules(
      selectedRules.map((r) => ({
        name: r.name,
        steps: r.steps,
      })),
      scale,
      { rng: Math.random, candidates },
    );
    return shuffle ? shuffleArray(items) : items;
  }

  return { selectedRules, totalPct, valid, counts, buildItems };
}