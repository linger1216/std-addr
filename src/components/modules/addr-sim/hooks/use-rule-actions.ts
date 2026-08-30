/**
 * 规则操作 hook —— 收集 page.tsx 中分散的 CRUD 编排逻辑:
 *  - 保存(新建/更新,含 radio/status)
 *  - 复制规则
 *  - "更新全局"(把步骤覆盖到所有规则的同名步骤 + 按要素重命名)
 *  - 从数据提取导入(逐条 + 完成回调 + 导入后占比重分配)
 *  - 快速分配占比(选中 N 条 → 按当前排序递减权重分配)
 *
 * page.tsx 只负责 UI 状态与挂载,业务动作集中在本 hook(可测、可复用)。
 */
"use client";

import { useCallback, useRef } from "react";
import { toast } from "sonner";

import { toApiError } from "@/lib/api/error";
import { allocateByWeights } from "@/lib/addr-sim/radios";

import type { AddrSimStep } from "@/lib/validators/addr-sim";
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
}

export function useRuleActions(opts: UseRuleActionsOptions) {
  const { rules, editingId, create, update, reallocate, onImportDialogChange } =
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

  /** 复制规则:名称加" (副本)",步骤深拷贝,radio 原样 */
  const handleCopy = useCallback(
    (rule: AddrSimRuleRow) => {
      create.mutate({
        name: `${rule.name} (副本)`,
        steps: JSON.parse(JSON.stringify(rule.steps)) as AddrSimStep[],
        radio: rule.radio ?? null,
      });
    },
    [create],
  );

  /**
   * "更新全局":把当前步骤配置覆盖所有规则中同名 label 的步骤,
   * 并按最新 steps 重新拼接规则名(规则名 = 要素1-要素2-… 约定)。
   */
  const handleUpdateAll = useCallback(
    async (step: AddrSimStep) => {
      const targetName = step.name;
      const tasks = rules
        .filter((r) => r.id !== editingId)
        .filter((r) => r.steps.some((s) => s.name === targetName))
        .map((r) => {
          const newSteps = r.steps.map((s) =>
            s.name === targetName ? { ...step } : s,
          );
          const derivedName = newSteps.map((s) => s.name).join("-") || "提取规则";
          return {
            id: r.id,
            name: derivedName,
            steps: newSteps,
            nameChanged: derivedName !== r.name,
          };
        });

      if (tasks.length === 0) {
        toast.warning(`未找到其它规则使用 "${targetName}"`);
        return;
      }

      let updated = 0;
      let failed = 0;
      const errors: string[] = [];
      await Promise.all(
        tasks.map(async (t) => {
          try {
            // 不传 radio(radio 字段独立于步骤,同步时不动)
            await update.mutateAsync({ id: t.id, name: t.name, steps: t.steps });
            updated += 1;
          } catch (err) {
            failed += 1;
            errors.push(toApiError(err).message);
          }
        }),
      );
      if (updated > 0) {
        const nameChangedCount = tasks.filter((t) => t.nameChanged).length;
        const msg =
          nameChangedCount > 0
            ? `已将 "${targetName}" 同步到 ${updated} 条规则,并按要素重命名 ${nameChangedCount} 条`
            : `已将 "${targetName}" 同步到 ${updated} 条规则`;
        toast.success(msg + (failed > 0 ? `,${failed} 条失败` : ""));
      }
      if (failed > 0) {
        const firstError = errors[0];
        toast.error(
          `部分规则同步失败${firstError ? `:${firstError}` : ""}`,
        );
      }
    },
    [rules, editingId, update],
  );

  /** 从数据提取导入:逐条创建(进度由 Dialog 管理),成功记录到 importedRef 供完成后重分配 */
  const handleImportOne = useCallback(
    async (rule: {
      name: string;
      steps: AddrSimStep[];
      radio: number;
      /** 样本次数(ExtractedRule.count,作为重分配权重) */
      count?: number;
    }) => {
      const res = (await create.mutateAsync({
        name: rule.name,
        steps: rule.steps,
        radio: rule.radio,
      })) as { id?: string } | null | undefined;
      // 只记录创建成功的规则(失败的不参与重分配)
      if (res?.id) {
        importedRef.current.push({
          id: res.id,
          name: rule.name,
          count: rule.count ?? 0,
          radio: rule.radio,
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
        // 参与者:现有规则(已设置占比,权重 = 当前占比)+ 本次导入成功规则(权重 = 样本次数)
        const weights: Array<{ id: string; weight: number }> = [];
        for (const r of rules) {
          // 导入期间每次 create 都会 invalidate,ruleList 可能已含本次新规则,
          // 用 createdIds 过滤,避免重复计数
          if (createdIds.has(r.id)) continue;
          if (typeof r.radio !== "number") continue; // 未设置占比的规则不参与
          weights.push({ id: r.id, weight: r.radio });
        }
        for (const c of created) weights.push({ id: c.id, weight: c.count });

        const targets = allocateByWeights(weights);
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
    handleUpdateAll,
    handleImportOne,
    handleImportComplete,
    handleQuickAllocate,
  };
}