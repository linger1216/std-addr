"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { Reveal } from "@/components/ui/reveal";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { useCrudMutations } from "@/lib/crud/use-crud-mutations";
import {
  type AddrSimStep,
} from "@/lib/validators/addr-sim";
import type { CandidatePool } from "@/lib/addr-sim/generator";

import { api } from "@/trpc/react";

import { AddrSimDataSourceCards } from "./addr-sim-data-source-cards";
import { AddrSimGenerateCard } from "./addr-sim-generate-card";
import { AddrSimRuleEditor, type AddrSimRuleRow } from "./addr-sim-rule-editor";
import { AddrSimRuleList } from "./addr-sim-rule-list";
import { AddrSimImportDialog } from "./addr-sim-import-dialog";
import {
  useAddrSimActions,
  useAddrSimRuleState,
} from "./stores/addr-sim-store";

const EMPTY_POOL: CandidatePool = {
  road: [],
  community: [],
  village: [],
  poi: [],
};

/**
 * 地址模拟页顶层编排。
 *
 * 布局(自上而下):
 *  1. 数据源卡片(四实体条目数 + 地址要素总数)
 *  2. 规则卡片(左侧列表多选 + 右侧步骤编辑器/拖拽/预览)
 *  3. 生成卡片(总条数 + 规则比例分配 + 预览 + 导出 Label Studio JSON)
 *
 * 数据流:
 *  - stats / candidates / labels / ruleList 四个 useQuery
 *  - useCrudMutations 管理 rule 的增删改(invalidate + toast)
 *  - 生成纯客户端(候选值 + 规则都在前端),导出走 Blob 下载
 */
export function AddrSimPage() {
  // —— 数据查询 ——
  const { data: stats } = api.addrSim.stats.useQuery();
  const { data: candidates, isPending: candidatesLoading } =
    api.addrSim.candidates.useQuery();
  const { data: labels } = api.addrSim.labels.useQuery();
  const { data: ruleList } = api.addrSim.ruleList.useQuery();

  const utils = api.useUtils();

  // —— 规则 CRUD ——
  const mut = useCrudMutations({
    utils,
    invalidateKeys: ["addrSim"],
    procedures: {
      create: api.addrSim.ruleCreate,
      update: api.addrSim.ruleUpdate,
      delete: api.addrSim.ruleDelete,
      deleteMany: api.addrSim.ruleDeleteMany,
    },
    messages: {
      createSuccess: "规则已创建",
      updateSuccess: "规则已保存",
      deleteSuccess: "已删除",
      deleteManySuccess: (n: number) => `已删除 ${n} 条`,
    },
  });

  // —— 编辑状态 ——
  const { selectedIds, editingId, editingName, draftSteps } = useAddrSimRuleState();
  const actions = useAddrSimActions();

  // —— 删除确认(单条 / 批量)——本地 state ——
  const [deleteRow, setDeleteRow] = useState<AddrSimRuleRow | null>(null);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const rules: AddrSimRuleRow[] = useMemo(
    () =>
      (ruleList ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        steps: (Array.isArray(r.steps) ? r.steps : []) as AddrSimStep[],
        radio: r.radio,
        status: r.status === 0 ? 0 : 1,
        updatedAt: r.updatedAt ? String(r.updatedAt) : null,
      })),
    [ruleList],
  );

  // 同步规则占比表到 store(勾选/快捷选择时自动初始化生成比例)
  useEffect(() => {
    actions.setRadioMap(
      Object.fromEntries(rules.map((r) => [r.id, r.radio ?? null])),
    );
  }, [rules, actions]);

  // —— 保存(create / update)——
  function handleSave(payload: {
    name: string;
    steps: AddrSimStep[];
    radio?: number | null;
    status?: 0 | 1;
  }) {
    if (editingId) {
      mut.update.mutate({ id: editingId, ...payload });
    } else {
      mut.create.mutate(payload);
    }
  }

  /**
   * 复制规则:名称加" (副本)",步骤深拷贝,radio 原样 —— 其余配置完全一致。
   */
  function handleCopy(rule: AddrSimRuleRow) {
    mut.create.mutate({
      name: `${rule.name} (副本)`,
      steps: JSON.parse(JSON.stringify(rule.steps)) as AddrSimStep[],
      radio: rule.radio ?? null,
    });
  }

  /**
   * "更新全局"：把当前步骤配置覆盖所有规则中同名 label 的步骤,
   * 并按最新 steps 重新拼接规则名(规则名 = 要素1-要素2-… 设计约定)。
   *  - 不修改当前编辑的草稿(用户在编辑器里已经看到当前步骤的最新值)
   *  - 并行调用 update,失败汇总
   *  - 不包括当前正在编辑的规则(editingId):编辑器草稿优先,避免冲掉用户未保存改动
   */
  async function handleUpdateAll(step: AddrSimStep) {
    const targetName = step.name;
    // 找含同名步骤的规则;每个目标规则基于新 steps 重新派生 name(要素拼接)
    const tasks = rules
      .filter((r) => r.id !== editingId)
      .filter((r) => r.steps.some((s) => s.name === targetName))
      .map((r) => {
        const newSteps = r.steps.map((s) =>
          s.name === targetName ? { ...step } : s,
        );
        return {
          id: r.id,
          name: newSteps.map((s) => s.name).join("-") || "提取规则",
          steps: newSteps,
          // 仅当派生 name 与原 name 不同(说明 step.name 变了),才视为"需要同步"
          nameChanged:
            newSteps.map((s) => s.name).join("-") !== r.name,
        };
      });

    if (tasks.length === 0) {
      toast.warning(`未找到其它规则使用 "${targetName}"`);
      return;
    }

    let updated = 0;
    let failed = 0;
    await Promise.all(
      tasks.map(async (t) => {
        try {
          // 不传 radio(radio 字段独立于步骤,同步时不动)
          await mut.update.mutateAsync({ id: t.id, name: t.name, steps: t.steps });
          updated += 1;
        } catch {
          failed += 1;
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
      toast.error("部分规则同步失败");
    }
  }

  // —— 删除确认动作 ——
  function confirmDelete() {
    if (deleteRow) mut.remove.mutate({ id: deleteRow.id });
    setDeleteRow(null);
  }
  function confirmBatchDelete() {
    if (selectedIds.length === 0) return;
    mut.removeMany.mutate({ ids: selectedIds });
    setBatchDeleteOpen(false);
    actions.clearSelect();
  }

  // 从 Label Studio 文件提取后导入:
  //  - 逐条调用 ruleCreate(Dialog 内实时显示进度)
  //  - 全部完成后 invalidate 一次 + 汇总 toast + 关闭 Dialog
  async function handleImportOne(rule: {
    name: string;
    steps: AddrSimStep[];
    radio: number;
  }) {
    await mut.create.mutateAsync({
      name: rule.name,
      steps: rule.steps,
      radio: rule.radio,
    });
  }

  async function handleImportComplete(result: {
    success: number;
    failed: number;
    total: number;
    lastError: string | null;
  }) {
    if (result.success > 0) {
      toast.success(
        `已导入 ${result.success} 条规则${result.failed > 0 ? `,${result.failed} 条失败` : ""}`,
      );
    }
    if (result.failed > 0 && result.lastError) {
      toast.error(result.lastError);
    }
    // 无论成败都关闭 Dialog(失败明细已在 Dialog 内展示)
    setImportOpen(false);
  }

  const pool = candidates ?? EMPTY_POOL;
  const labelOptions = labels ?? [];

  // 编辑打开时若规则已被删,关闭编辑器
  useEffect(() => {
    if (editingId && !rules.some((r) => r.id === editingId)) {
      actions.closeEditor();
    }
  }, [editingId, rules, actions]);

  const isEditorPending = mut.create.isPending || mut.update.isPending;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        title="地址模拟"
        description="基于道路 / 小区 / 村 / POI 实体数据源,可视化配置规则,批量生成带精准分片标注、符合 Label Studio 导入标准的地址数据集"
      />

      {/* 1. 数据源卡片 */}
      <Reveal className="shrink-0">
        <AddrSimDataSourceCards stats={stats} />
      </Reveal>

      {/* 2. 规则卡片(列表 + 编辑器) */}
      <Reveal delay={60} className="shrink-0">
        <Card className="p-4">
          <div className="flex gap-4 max-lg:flex-col">
            {/* 左侧:规则列表(多选 + 新建/删除) */}
            <div className="w-full shrink-0 lg:w-80 xl:w-96">
              <AddrSimRuleList
                rules={rules}
                selectedIds={selectedIds}
                editingId={editingId}
                onToggleSelect={actions.toggleSelect}
                onOpenEdit={(r) =>
                  actions.openEdit(r.id, r.name, r.steps, r.radio, r.status)
                }
                onCreate={() => {
                  actions.openCreate();
                }}
                onImport={() => setImportOpen(true)}
                onCopy={handleCopy}
                onDelete={(r) => setDeleteRow(r)}
                onDeleteMany={() => {
                  // 多选已在列表内,直接打开确认框
                  setBatchDeleteOpen(true);
                }}
              />
            </div>

            {/* 右侧:编辑器 */}
            <div className="min-w-0 flex-1 border-t border-border pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-4">
              {editingId !== null || editingName !== "" || draftSteps.length > 0 ? (
                <AddrSimRuleEditor
                  labels={labelOptions}
                  candidates={pool}
                  isPending={isEditorPending}
                  onSave={handleSave}
                  onUpdateAll={handleUpdateAll}
                />
              ) : candidatesLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-64" />
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-32 w-full" />
                </div>
              ) : (
                <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 text-center">
                  <div className="flex size-10 items-center justify-center rounded-2xl bg-secondary">
                    <X className="size-4 text-muted-foreground" />
                  </div>
                  <p className="text-[13px] text-muted-foreground">
                    从左侧选择规则进行编辑,或点击「新建规则」
                  </p>
                </div>
              )}
            </div>
          </div>
        </Card>
      </Reveal>

      {/* 3. 生成卡片 */}
      <Reveal delay={120} className="shrink-0">
        <Card className="p-4">
          <CardContent className="p-0">
            <AddrSimGenerateCard
              rules={rules}
              selectedIds={selectedIds}
              candidates={pool}
            />
          </CardContent>
        </Card>
      </Reveal>

      {/* 单条删除确认 */}
      <Dialog
        open={Boolean(deleteRow)}
        onOpenChange={(v) => {
          if (!v) setDeleteRow(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除规则</DialogTitle>
            <DialogDescription>
              {`确定删除规则「${deleteRow?.name ?? ""}」?此操作不可恢复。`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteRow(null)}>
              取消
            </Button>
            <Button
              onClick={confirmDelete}
              disabled={mut.remove.isPending}
              className="bg-danger text-white hover:bg-danger/90"
            >
              {mut.remove.isPending ? "删除中…" : "删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批量删除确认 */}
      <Dialog
        open={batchDeleteOpen}
        onOpenChange={(v) => {
          if (!v) setBatchDeleteOpen(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>批量删除</DialogTitle>
            <DialogDescription>
              {`确定删除选中的 ${selectedIds.length} 条规则?此操作不可恢复。`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBatchDeleteOpen(false)}>
              取消
            </Button>
            <Button
              onClick={confirmBatchDelete}
              disabled={mut.removeMany.isPending || selectedIds.length === 0}
              className="bg-danger text-white hover:bg-danger/90"
            >
              {mut.removeMany.isPending ? "删除中…" : "删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 从 Label Studio 标注文件提取规则 */}
      <AddrSimImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        labels={labelOptions}
        existingRuleNames={rules.map((r) => r.name)}
        onImportOne={handleImportOne}
        onImportComplete={handleImportComplete}
      />
    </div>
  );
}