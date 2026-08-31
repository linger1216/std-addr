"use client";

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */

import { useEffect, useMemo } from "react";
import { Plus } from "lucide-react";

import {
  LabelFormDialog,
  type LabelDetail,
  type LabelFormValues,
} from "./label-form";
import { LabelStats } from "./label-stats";
import {
  LabelTable,
  createLabelColumns,
  type LabelRow,
} from "./label-table";
import { LabelToolbar } from "./label-toolbar";
import { LabelDetailDialog } from "./label-detail";
import { ExcelImportDialog } from "@/components/modules/shared/excel-import";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button, MotionButton } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { Reveal } from "@/components/ui/reveal";
import { PaginationControl } from "@/components/modules/shared/pagination-control";

import { useLabelState, useLabelActions } from "./stores/label-store";
import { useLabelQueryParams } from "./use-label-query-params";
import { useCrudExcel } from "@/lib/crud/use-crud-excel";
import { useCrudMutations } from "@/lib/crud/use-crud-mutations";
import { useCrudTable } from "@/lib/crud/use-crud-table";

import { api } from "@/trpc/react";

/**
 * Label 页顶层编排(以 community 为模板)。
 *
 * 数据流:
 *   useLabelQueryParams (store) → submitted query params
 *     ↓
 *   tRPC useQuery (list / stats / getById)
 *     ↓
 *   useCrudTable (table 实例 + 选中 + 分页/排序)
 *     ↓
 *   LabelTable / Toolbar / PaginationControl / Stats / Dialogs
 *
 * 副作用流:
 *   useCrudMutations (create/update/delete/deleteMany)
 *     ↓ invalidate list+stats → useQuery 自动重拉
 */
export function LabelPage() {
  // —— 1. 查询参数 store(搜索/状态)——
  const filters = useLabelQueryParams((s) => s.committed);

  // —— 2. UI store(分页/排序/选中/dialog)——
  const state = useLabelState();
  const actions = useLabelActions();

  // —— 3. tRPC utils ——
  const utils = api.useUtils();

  // —— 4. mutation 套件(invalidate + toast + 副作用统一)——
  const mut = useCrudMutations({
    utils,
    invalidateKeys: ["label"],
    procedures: {
      create: api.label.create,
      update: api.label.update,
      delete: api.label.delete,
      deleteMany: api.label.deleteMany,
    },
    messages: {
      createSuccess: "要素已创建",
      updateSuccess: "要素已更新",
      deleteSuccess: "已删除",
      deleteManySuccess: (n: number) => `已删除 ${n} 条`,
    },
    hooks: {
      onAfterCreate: () => {
        actions.closeForm();
      },
      onAfterUpdate: () => {
        actions.closeForm();
      },
      onAfterDelete: () => {
        actions.cancelDelete();
        actions.clearSelection();
      },
      onAfterDeleteMany: () => {
        actions.cancelBatchDelete();
        actions.clearSelection();
      },
    },
  });

  // —— 5. 列表查询 ——
  const listQueryParas = useMemo(
    () => ({
      page: state.page,
      pageSize: state.pageSize,
      q: filters.q ?? undefined,
      status:
        filters.status === ""
          ? undefined
          : (Number(filters.status) as 0 | 1),
      sort: state.sorting.length > 0
        ? state.sorting.map((sx) => ({
            id: sx.id as "name" | "label" | "status" | "createdAt",
            desc: sx.desc,
          }))
        : undefined,
    }),
    [state.page, state.pageSize, state.sorting, filters],
  );

  const { data: listData, isLoading: listLoading } =
    api.label.list.useQuery(listQueryParas);
  const { data: stats } = api.label.stats.useQuery();

  // 切换筛选 → 回第一页
  useEffect(() => {
    actions.setPage(1);
  }, [filters.q, filters.status, actions]);

  // —— 6. table 实例(选中/分页/排序统一)——
  const rows: LabelRow[] = listData?.items ?? [];
  const total = listData?.total ?? 0;

  const columns = useMemo(() => createLabelColumns(), []);

  const { table, selectedIds, columnSizing } = useCrudTable<LabelRow>({
    data: rows,
    columns,
    getRowId: (r) => r.id,
    pageSize: state.pageSize,
    total,
    sorting: state.sorting,
    rowSelection: state.rowSelection,
    onSortingChange: actions.setSorting,
    onRowSelectionChange: actions.setRowSelection,
    storageKey: "label",
  });

  // —— 7. 编辑/详情 —— 双 useQuery(id 是 detailId / editingId)——
  const { data: detailData } = api.label.getById.useQuery(
    { id: state.detailId ?? "" },
    { enabled: Boolean(state.detailId) },
  );
  const { data: editingData } = api.label.getById.useQuery(
    { id: state.editingId ?? "" },
    { enabled: Boolean(state.editingId) },
  );

  // 编辑请求发出后,等详情加载完成,store 自动打开 form
  useEffect(() => {
    if (state.editingId && editingData) actions.openFormWhenReady();
  }, [state.editingId, editingData, actions]);

  // —— 8. 提交表单:create / update ——
  function handleSubmit(values: LabelFormValues) {
    if (values.id) {
      mut.update.mutate({
        id: values.id,
        name: values.name,
        label: values.label,
        status: values.status,
      });
    } else {
      mut.create.mutate({
        name: values.name,
        label: values.label,
        status: values.status,
      });
    }
  }

  // —— 9. 导出 / 导入 套件 ——
  type ImportRowInput = {
    name: string;
    label?: string;
    status?: 0 | 1;
  };
  type ImportInput = { rows: ImportRowInput[] };

  const excel = useCrudExcel<LabelRow, ImportRowInput, ImportInput>({
    moduleName: "要素",
    exportColumns: [
      { header: "名称", width: 24 },
      { header: "标签", width: 20 },
      { header: "状态", width: 12 },
    ],
    exportRow: (r) => ({
      "名称": r.name,
      "标签": r.label ?? "",
      "状态": r.status === 1 ? 1 : 0,
    }),
    fetchAll: () =>
      utils.label.exportAll
        .fetch({
          q: filters.q ?? undefined,
          status:
            filters.status === ""
              ? undefined
              : (Number(filters.status) as 0 | 1),
          sort: state.sorting.map((sx) => ({
            id: sx.id as "name" | "label" | "status" | "createdAt",
            desc: sx.desc,
          })),
        })
        .then((items) => items as LabelRow[]),
    importFields: [
      { key: "name", label: "名称", required: true, width: 24 },
      { key: "label", label: "标签", width: 20 },
      { key: "status", label: "状态(1启用/0禁用)", width: 20 },
    ],
    coerceRow: (r) => ({
      name: r.name ?? "",
      label: r.label ?? undefined,
      status: r.status === "1" ? 1 : r.status === "0" ? 0 : undefined,
    }),
    wrapInput: (rows) => ({ rows }),
    importMutation: api.label.import,
  });

  // —— 10. 删除确认 ——
  function confirmDelete() {
    if (state.deleteRow) mut.remove.mutate({ id: state.deleteRow.id });
  }
  function confirmBatchDelete() {
    if (selectedIds.length === 0) return;
    mut.removeMany.mutate({ ids: selectedIds });
  }

  // —— 11. 派生显示数据 ——
  const editingFormInitial: LabelDetail | null =
    state.editingId && editingData ? editingData : null;
  const detail: LabelDetail | null = detailData ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        title="地址要素"
        description="维护地址组件要素字典(省份 / 城市 / 区县 / 道路 / 小区 …)"
        actions={
          <MotionButton onClick={actions.openCreate}>
            <Plus className="size-4" />
            新建要素
          </MotionButton>
        }
      />

      <Reveal className="shrink-0">
        <LabelStats stats={stats} />
      </Reveal>

      <Reveal delay={60} className="shrink-0">
        <LabelToolbar
          selectedCount={selectedIds.length}
          onCreate={actions.openCreate}
          onImport={excel.openImport}
          onExport={excel.handleExport}
          onBatchDelete={actions.requestBatchDelete}
        />
      </Reveal>

      <Reveal delay={120} className="min-h-0 flex-1">
        <LabelTable
          table={table}
          isLoading={listLoading}
          columnSizing={columnSizing}
          callbacks={{
            onView: (row) => actions.openView(row.id),
            onEdit: (row) => actions.openEdit(row.id),
            onDelete: (row) =>
              actions.requestDelete({ id: row.id, name: row.name }),
          }}
        />
      </Reveal>

      <div className="shrink-0">
        <PaginationControl
          page={state.page}
          pageSize={state.pageSize}
          total={total}
          onPageChange={actions.setPage}
          onPageSizeChange={actions.setPageSize}
        />
      </div>

      <LabelFormDialog
        open={state.formOpen}
        onOpenChange={(v) => {
          if (!v) actions.closeForm();
        }}
        initial={editingFormInitial}
        onSubmit={handleSubmit}
        isPending={mut.create.isPending || mut.update.isPending}
      />

      <LabelDetailDialog
        open={state.detailOpen}
        onOpenChange={(v) => {
          if (!v) actions.closeDetail();
        }}
        detail={detail}
      />

      <ExcelImportDialog {...excel.importDialogProps} />

      {/* 单条删除 confirm */}
      <Dialog
        open={Boolean(state.deleteRow)}
        onOpenChange={(v) => {
          if (!v) actions.cancelDelete();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除要素</DialogTitle>
            <DialogDescription>
              {`确定删除要素「${state.deleteRow?.name ?? ""}」?此操作不可恢复。`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={actions.cancelDelete}>
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

      {/* 批量删除 confirm */}
      <Dialog
        open={state.batchDeleteOpen}
        onOpenChange={(v) => {
          if (!v) actions.cancelBatchDelete();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>批量删除</DialogTitle>
            <DialogDescription>
              {`确定删除选中的 ${selectedIds.length} 条要素?此操作不可恢复。`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={actions.cancelBatchDelete}>
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
    </div>
  );
}