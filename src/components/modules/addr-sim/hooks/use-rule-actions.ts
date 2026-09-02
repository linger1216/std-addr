/**
 * 规则操作 hook —— 收集 page.tsx 中分散的 CRUD 编排逻辑:
 *  - 保存(新建/更新,含 radio/status)
 *  - 复制规则
 *  - "保存到要素"(把当前步骤的生效配置写回地址要素默认,所有引用该要素的步骤继承)
 *  - 从数据提取导入(逐条 + 完成回调 + 导入后占比重分配)
 *  - 快速分配占比(选中 N 条 → 按当前排序递减权重分配)
 *
 * page.tsx 只负责 UI 状态与挂载,业务动作集中在本 hook(可测、可复用)。
 */
"use client";

import { useCallback, useRef } from "react";
import { toast } from "sonner";

import { toApiError } from "@/lib/api/error";
import { computeReallocatedRadios } from "@/lib/addr-sim/radios";
import { resolveStepWithLabel } from "@/lib/addr-sim/resolve-step";

import {
  type AddrSimLabel,
  type AddrSimLabelConfig,
  type AddrSimStep,
} from "@/lib/validators/addr-sim";
import type { AddrSimRuleRow } from "../addr-sim-rule-editor";
import { useAddrSimStore } from "../stores/addr-sim-store";

/** 批量占比更新 mutation 的最小形态(输入由 tRPC 推断) */
type BatchRadioMutation = {
  mutate: (input: { updates: Array<{ id: string; radio: number }> }) => void;
};

export interface UseRuleActionsOptions {
  /** 当前规则列表(读最新数据,避免闭包过期) */
  rules: AddrSimRuleRow[];
  editingId: string | null;
  /** useCrudMutations 返回的 create/update(已带 invalidate + toast) */
  create: {
    mutate: (input: unknown) => void;
    mutateAsync: (input: unknown) => Promise<unknown>;
  };
  update: {
    mutate: (input: unknown) => void;
    mutateAsync: (input: unknown) => Promise<unknown>;
  };
  /**
   * 批量占比更新(ruleBatchUpdate)。
   * 导入后重分配 + 快速分配占比共用,一次调用避免 N 次 update 各自 toast。
   */
  reallocate: BatchRadioMutation;
  /** 地址要素字典(含 id + 默认配置),供"保存到要素"使用 */
  labels: AddrSimLabel[];
  /** 更新地址要素默认配置(label.update);入参 { id, data } */
  saveLabel: {
    mutateAsync: (input: { id: string; data: AddrSimLabelConfig | null }) => Promise<unknown>;
  };
  onImportDialogChange: (v: boolean) => void;
}

/** 本次导入成功创建的规则(供完成后占比重分配) */
interface ImportedCreate {
  id: string;
  name: string;
  /** 样本次数(新规则的权重来源) */
  count: number;
  /** 创建时写入的占比(用于判断是否还需更新) */
  radio: number;
  /** 总样本数(所属导入文件总记录数) */
  total: number;
}

export function useRuleActions(opts: UseRuleActionsOptions) {
  const { rules, editingId, create, update, reallocate, labels, saveLabel, onImportDialogChange } =
    opts;

  /** 本次导入成功创建的规则(每次导入完成清空) */
  const importedRef = useRef<ImportedCreate[]>([]);

  /** 保存:新建或更新(radio/status 随 payload 传递) */
  const handleSave = useCallback(
    (payload: {
      name: string;
      steps: AddrSimStep[];
      radio?: number | null;
      status?: 0 | 1;
    }) => {
      if (editingId) {
        update.mutate({ id: editingId, ...payload });
      } else {
        create.mutate(payload);
      }
    },
    [editingId, create, update],
  );

  /** 复制规则:名称加" (副本)",步骤深拷贝,radio/count/total 原样 */
  const handleCopy = useCallback(
    (rule: AddrSimRuleRow) => {
      create.mutate({
        name: `${rule.name} (副本)`,
        steps: JSON.parse(JSON.stringify(rule.steps)) as AddrSimStep[],
        radio: rule.radio ?? null,
        count: rule.count ?? undefined,
        total: rule.total ?? undefined,
      });
    },
    [create],
  );

  /**
   * "保存到要素":把当前步骤的生效配置(数据源/前后缀/整体跳过率,含继承自 label 的部分)
   * 写回地址要素默认配置,使所有引用该要素的步骤都继承这份默认。
   * 保留原 label 的干扰率(步骤不单独配置干扰)。
   */
  const handleSaveToElement = useCallback(
    async (step: AddrSimStep) => {
      const targetName = step.name;
      const label = labels.find((l) => l.name === targetName);
      if (!label) {
        toast.warning(`未找到地址要素 "${targetName}",请先在「地址要素」页创建`);
        return;
      }

      // 合并 label 默认 → 当前步骤的生效配置(与预览/生成一致)
      const resolved = resolveStepWithLabel(step, label);
      const config: AddrSimLabelConfig = {
        ...resolved.data,
        ...(resolved.prefix ? { prefix: resolved.prefix } : {}),
        ...(resolved.suffix ? { suffix: resolved.suffix } : {}),
        skipRate: resolved.skipRate,
        noiseRate: resolved.noiseRate,
      };

      try {
        await saveLabel.mutateAsync({ id: label.id!, data: config });
        toast.success(
          `已保存到地址要素「${label.label ?? targetName}」,所有引用该要素的步骤将使用此默认配置`,
        );
      } catch (err) {
        toast.error(toApiError(err).message);
      }
    },
    [labels, saveLabel],
  );

  /** 从数据提取导入:逐条创建(进度由 Dialog 管理),成功记录到 importedRef 供完成后重分配 */
  const handleImportOne = useCallback(
    async (rule: {
      name: string;
      steps: AddrSimStep[];
      radio: number;
      /** 样本次数(ExtractedRule.count,作为重分配权重并持久化) */
      count?: number;
      /** 总样本数(所属导入文件总记录数) */
      total?: number;
    }) => {
      const res = (await create.mutateAsync({
        name: rule.name,
        steps: rule.steps,
        radio: rule.radio,
        count: rule.count,
        total: rule.total,
      })) as { id?: string } | null | undefined;
      // 只记录创建成功的规则(失败的不参与重分配)
      if (res?.id) {
        importedRef.current.push({
          id: res.id,
          name: rule.name,
          count: rule.count ?? 0,
          radio: rule.radio,
          total: rule.total ?? 0,
        });
      }
      return { id: res?.id ?? "" };
    },
    [create],
  );

  /**
   * 导入完成后:按「现有规则占比 + 本次导入规则样本次数」重新分配全部占比,
   * 使合计恒为 100%(需求:导入时按当前规则 + 新导入规则重新分配占比)。
   * 涉及占比变化的规则走一次 ruleBatchUpdate,避免 N 次 update 各自 toast。
   */
  const handleImportComplete = useCallback(
    (result: {
      success: number;
      failed: number;
      total: number;
      lastError: string | null;
    }) => {
      const created = importedRef.current;
      const createdIds = new Set(created.map((c) => c.id));

      // —— 占比重分配 ——
      let reallocated = false;
      if (result.success > 0 && created.length > 0) {
        // 公平重算:现有规则有 count 用 count(否则 radio 兜底),新导入规则按 count。
        // 导入期间每次 create 都会 invalidate,ruleList 可能已含本次新规则,用 createdIds 过滤避免重复计数。
        const targets = computeReallocatedRadios(
          rules.filter((r) => !createdIds.has(r.id)),
          created.map((c) => ({ id: c.id, count: c.count })),
        );
        const updates: Array<{ id: string; radio: number }> = [];
        for (const r of rules) {
          if (createdIds.has(r.id)) continue;
          if (typeof r.radio !== "number") continue;
          const t = targets[r.id];
          if (t !== undefined && t !== r.radio) {
            updates.push({ id: r.id, radio: t });
          }
        }
        for (const c of created) {
          const t = targets[c.id];
          if (t !== undefined && t !== c.radio) {
            updates.push({ id: c.id, radio: t });
          }
        }

        if (updates.length > 0) {
          reallocate.mutate({ updates });
          reallocated = true;
          // 生成比例同步:已勾选的规则立即用新占比(不必等列表刷新)
          const state = useAddrSimStore.getState();
          for (const u of updates) {
            if (state.selectedIds.includes(u.id)) state.setRatio(u.id, u.radio);
          }
        }
      }
      importedRef.current = [];

      // —— 汇总提示 ——
      if (result.success > 0) {
        toast.success(
          `已导入 ${result.success} 条规则${result.failed > 0 ? `,${result.failed} 条失败` : ""}${reallocated ? ",占比已按权重重新分配(合计 100%)" : ""}`,
        );
      }
      if (result.failed > 0 && result.lastError) {
        toast.error(result.lastError);
      }
      // 无论成败都关闭 Dialog(失败明细已在 Dialog 内展示)
      onImportDialogChange(false);
    },
    [rules, reallocate, onImportDialogChange],
  );

  /**
   * 快速分配占比:把选中规则(按当前排序的传入顺序)的占比批量设为 pairs 中的值。
   * pairs 由规则列表用 allocateByOrder 计算(第一个规则占比最多)。
   * 效果:
   *  - 立即更新生成卡片比例(store.ratios);
   *  - 批量持久化到规则 radio(ruleBatchUpdate,一次调用)。
   */
  const handleQuickAllocate = useCallback(
    (pairs: Array<{ id: string; radio: number }>) => {
      if (pairs.length === 0) return;
      const state = useAddrSimStore.getState();
      for (const p of pairs) state.setRatio(p.id, p.radio);
      reallocate.mutate({ updates: pairs });
    },
    [reallocate],
  );

  return {
    handleSave,
    handleCopy,
    handleSaveToElement,
    handleImportOne,
    handleImportComplete,
    handleQuickAllocate,
  };
}