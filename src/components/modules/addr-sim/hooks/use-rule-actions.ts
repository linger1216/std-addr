/**
 * 规则操作 hook —— 收集 page.tsx 中分散的 CRUD 编排逻辑:
 *  - 保存(新建/更新,含 radio/status)
 *  - 复制规则
 *  - "更新全局"(把步骤覆盖到所有规则的同名步骤 + 按要素重命名)
 *  - 从数据提取导入(逐条 + 完成回调)
 *
 * page.tsx 只负责 UI 状态与挂载,业务动作集中在本 hook(可测、可复用)。
 */
"use client";

import { useCallback } from "react";
import { toast } from "sonner";

import { toApiError } from "@/lib/api/error";

import type { AddrSimStep } from "@/lib/validators/addr-sim";
import type { AddrSimRuleRow } from "../addr-sim-rule-editor";

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
  onImportDialogChange: (v: boolean) => void;
}

export function useRuleActions(opts: UseRuleActionsOptions) {
  const { rules, editingId, create, update, onImportDialogChange } = opts;

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

  /** 从数据提取导入:逐条创建(进度由 Dialog 管理),完成回调关闭 Dialog */
  const handleImportOne = useCallback(
    async (rule: { name: string; steps: AddrSimStep[]; radio: number }) => {
      await create.mutateAsync({
        name: rule.name,
        steps: rule.steps,
        radio: rule.radio,
      });
    },
    [create],
  );

  const handleImportComplete = useCallback(
    (result: {
      success: number;
      failed: number;
      total: number;
      lastError: string | null;
    }) => {
      if (result.success > 0) {
        toast.success(
          `已导入 ${result.success} 条规则${result.failed > 0 ? `,${result.failed} 条失败` : ""}`,
        );
      }
      if (result.failed > 0 && result.lastError) {
        toast.error(result.lastError);
      }
      // 无论成败都关闭 Dialog(失败明细已在 Dialog 内展示)
      onImportDialogChange(false);
    },
    [onImportDialogChange],
  );

  return {
    handleSave,
    handleCopy,
    handleUpdateAll,
    handleImportOne,
    handleImportComplete,
  };
}