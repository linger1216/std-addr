"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { Reveal } from "@/components/ui/reveal";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import { useCrudMutations } from "@/lib/crud/use-crud-mutations";
import { toApiError } from "@/lib/api/error";
import type { CandidatePool } from "@/lib/addr-sim/generator";
import { toRuleRows } from "@/lib/addr-sim/rule-mappers";

import { api } from "@/trpc/react";

import { AddrSimDataSourceCards } from "./addr-sim-data-source-cards";
import { AddrSimGenerateCard } from "./addr-sim-generate-card";
import { AddrSimRuleEditor, type AddrSimRuleRow } from "./addr-sim-rule-editor";
import { AddrSimRuleList } from "./addr-sim-rule-list";
import { AddrSimImportDialog } from "./addr-sim-import-dialog";
import { useRuleActions } from "./hooks/use-rule-actions";
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

  // 批量占比更新:导入后重分配 / 快速分配占比 共用(一次调用,一条 toast,一次失效)
  const batchRadio = api.addrSim.ruleBatchUpdate.useMutation({
    onSuccess: async (res) => {
      await utils.addrSim.invalidate();
      const count =
        (res as { count?: number } | null | undefined)?.count ?? 0;
      toast.success(`占比已更新(${count} 条)`);
    },
    onError: (e) => toast.error(toApiError(e).message),
  });

  // —— 编辑状态 ——
  const { selectedIds, editingId, editingName, draftSteps } = useAddrSimRuleState();
  const actions = useAddrSimActions();

  // —— 删除确认(单条 / 批量)——本地 state ——
  const [deleteRow, setDeleteRow] = useState<AddrSimRuleRow | null>(null);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const rules: AddrSimRuleRow[] = useMemo(
    () => toRuleRows(ruleList ?? []),
    [ruleList],
  );

  // 同步规则占比表到 store(勾选/快捷选择时自动初始化生成比例)
  useEffect(() => {
    actions.setRadioMap(
      Object.fromEntries(rules.map((r) => [r.id, r.radio ?? null])),
    );
  }, [rules, actions]);

  // —— 规则操作(保存/复制/全局同步/导入 + 批量占比)——抽到 hooks/use-rule-actions
  const ruleActions = useRuleActions({
    rules,
    editingId,
    create: mut.create,
    update: mut.update,
    reallocate: {
      mutate: (input: { updates: Array<{ id: string; radio: number }> }) =>
        batchRadio.mutate(input),
    },
    onImportDialogChange: setImportOpen,
  });

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

  const pool = candidates ?? EMPTY_POOL;
  const labelOptions = labels ?? [];

  // 编辑中的规则被删除:保留草稿转"新建"态,不丢未保存内容
  useEffect(() => {
    if (editingId && !rules.some((r) => r.id === editingId)) {
      actions.detachEditor();
      toast.warning("当前编辑的规则已被删除,草稿已转为新建(保存将创建新规则)");
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
                onCopy={ruleActions.handleCopy}
                onDelete={(r) => setDeleteRow(r)}
                onDeleteMany={() => {
                  // 多选已在列表内,直接打开确认框
                  setBatchDeleteOpen(true);
                }}
                onQuickAllocate={ruleActions.handleQuickAllocate}
              />
            </div>

            {/* 右侧:编辑器 */}
            <div className="min-w-0 flex-1 border-t border-border pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-4">
              {editingId !== null || editingName !== "" || draftSteps.length > 0 ? (
                <AddrSimRuleEditor
                  labels={labelOptions}
                  candidates={pool}
                  isPending={isEditorPending}
                  onSave={ruleActions.handleSave}
                  onUpdateAll={ruleActions.handleUpdateAll}
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
      <ConfirmDialog
        open={Boolean(deleteRow)}
        onOpenChange={(v) => {
          if (!v) setDeleteRow(null);
        }}
        title="删除规则"
        description={`确定删除规则「${deleteRow?.name ?? ""}」?此操作不可恢复。`}
        isPending={mut.remove.isPending}
        onConfirm={confirmDelete}
      />

      {/* 批量删除确认 */}
      <ConfirmDialog
        open={batchDeleteOpen}
        onOpenChange={(v) => {
          if (!v) setBatchDeleteOpen(false);
        }}
        title="批量删除"
        description={`确定删除选中的 ${selectedIds.length} 条规则?此操作不可恢复。`}
        isPending={mut.removeMany.isPending}
        onConfirm={confirmBatchDelete}
      />

      {/* 从 Label Studio 标注文件提取规则 */}
      <AddrSimImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        labels={labelOptions}
        existingRuleNames={rules.map((r) => r.name)}
        onImportOne={ruleActions.handleImportOne}
        onImportComplete={ruleActions.handleImportComplete}
      />
    </div>
  );
}