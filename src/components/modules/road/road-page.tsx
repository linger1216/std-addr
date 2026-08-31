"use client";

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */

import { useEffect, useMemo } from "react";
import { Plus } from "lucide-react";

import {
  RoadFormDialog,
  type RoadDetail,
  type RoadFormValues,
} from "./road-form";
import { RoadStats } from "./road-stats";
import {
  RoadTable,
  createRoadColumns,
  type RoadRow,
} from "./road-table";
import { RoadToolbar } from "./road-toolbar";
import { RoadDetailDialog } from "./road-detail";
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

import { useRoadState, useRoadActions } from "./stores/road-store";
import { useRoadQueryParams } from "./use-road-query-params";
import { useCrudExcel } from "@/lib/crud/use-crud-excel";
import { useCrudMutations } from "@/lib/crud/use-crud-mutations";
import { useCrudTable } from "@/lib/crud/use-crud-table";

import { api } from "@/trpc/react";

/**
 * 道路页顶层编排(以 community 为模板)。
 *
 * 数据流:
 *   useRoadQueryParams (store) → submitted query params
 *     ↓
 *   tRPC useQuery (list / stats / getById)
 *     ↓
 *   useCrudTable (table 实例 + 选中 + 分页/排序)
 *     ↓
 *   RoadTable / Toolbar / PaginationControl / Stats / Dialogs
 *
 * 副作用流:
 *   useCrudMutations (create/update/delete/deleteMany)
 *     ↓ invalidate list+stats → useQuery 自动重拉
 */
export function RoadPage() {
  // —— 1. 查询参数 store(搜索/状态)——
  const filters = useRoadQueryParams((s) => s.committed);

  // —— 2. UI store(分页/排序/选中/dialog)——
  const state = useRoadState();
  const actions = useRoadActions();

  // —— 3. tRPC utils ——
  const utils = api.useUtils();

  // —— 4. mutation 套件(invalidate + toast + 副作用统一)——
  const mut = useCrudMutations({
    utils,
    invalidateKeys: ["road"],
    procedures: {
      create: api.road.create,
      update: api.road.update,
      delete: api.road.delete,
      deleteMany: api.road.deleteMany,
    },
    messages: {
      createSuccess: "道路已创建",
      updateSuccess: "道路已更新",
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
            id: sx.id as "road" | "status" | "createdAt",
            desc: sx.desc,
          }))
        : undefined,
    }),
    [state.page, state.pageSize, state.sorting, filters],
  );

  const { data: listData, isLoading: listLoading } =
    api.road.list.useQuery(listQueryParas);
  const { data: stats } = api.road.stats.useQuery();

  // 切换筛选 → 回第一页
  useEffect(() => {
    actions.setPage(1);
  }, [filters.q, filters.status, actions]);

  // —— 6. table 实例(选中/分页/排序统一)——
  const rows: RoadRow[] = listData?.items ?? [];
  const total = listData?.total ?? 0;

  const columns = useMemo(() => createRoadColumns(), []);

  const { table, selectedIds } = useCrudTable<RoadRow>({
    data: rows,
    columns,
    getRowId: (r) => r.id,
    pageSize: state.pageSize,
    total,
    sorting: state.sorting,
    rowSelection: state.rowSelection,
    onSortingChange: actions.setSorting,
    onRowSelectionChange: actions.setRowSelection,
    storageKey: "road",
  });

  // —— 7. 编辑/详情 —— 双 useQuery(id 是 detailId / editingId)——
  const { data: detailData } = api.road.getById.useQuery(
    { id: state.detailId ?? "" },
    { enabled: Boolean(state.detailId) },
  );
  const { data: editingData } = api.road.getById.useQuery(
    { id: state.editingId ?? "" },
    { enabled: Boolean(state.editingId) },
  );

  // 编辑请求发出后,等详情加载完成,store 自动打开 form
  useEffect(() => {
    if (state.editingId && editingData) actions.openFormWhenReady();
  }, [state.editingId, editingData, actions]);

  // —— 8. 提交表单:create / update ——
  function handleSubmit(values: RoadFormValues) {
    if (values.id) {
      mut.update.mutate({
        id: values.id,
        road: values.road,
        status: values.status,
      });
    } else {
      mut.create.mutate({
        road: values.road,
        status: values.status,
      });
    }
  }

  // —— 9. 导出 / 导入 套件 ——
  type ImportRowInput = {
    road: string;
    status?: 0 | 1;
  };
  type ImportInput = { rows: ImportRowInput[] };

  const excel = useCrudExcel<RoadRow, ImportRowInput, ImportInput>({
    moduleName: "道路",
    exportColumns: [
      { header: "道路名", width: 30 },
      { header: "状态", width: 12 },
    ],
    exportRow: (r) => ({
      "道路名": r.road,
      "状态": r.status === 1 ? 1 : 0,
    }),
    fetchAll: () =>
      utils.road.exportAll
        .fetch({
          q: filters.q ?? undefined,
          status:
            filters.status === ""
              ? undefined
              : (Number(filters.status) as 0 | 1),
          sort: state.sorting.map((sx) => ({
            id: sx.id as "road" | "status" | "createdAt",
            desc: sx.desc,
          })),
        })
        .then((items) => items as RoadRow[]),
    importFields: [
      { key: "road", label: "道路名", required: true, width: 30 },
      { key: "status", label: "状态(1启用/0禁用)", width: 20 },
    ],
    coerceRow: (r) => ({
      road: r.road ?? "",
      status: r.status === "1" ? 1 : r.status === "0" ? 0 : undefined,
    }),
    wrapInput: (rows) => ({ rows }),
    importMutation: api.road.import,
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
  const editingFormInitial: RoadDetail | null =
    state.editingId && editingData ? editingData : null;
  const detail: RoadDetail | null = detailData ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        title="道路管理"
        description="维护道路名、起止点与走向"
        actions={
          <MotionButton onClick={actions.openCreate}>
            <Plus className="size-4" />
            新建道路
          </MotionButton>
        }
      />

      <Reveal className="shrink-0">
        <RoadStats stats={stats} />
      </Reveal>

      <Reveal delay={60} className="shrink-0">
        <RoadToolbar
          selectedCount={selectedIds.length}
          onCreate={actions.openCreate}
          onImport={excel.openImport}
          onExport={excel.handleExport}
          onBatchDelete={actions.requestBatchDelete}
        />
      </Reveal>

      <Reveal delay={120} className="min-h-0 flex-1">
        <RoadTable
          table={table}
          isLoading={listLoading}
          callbacks={{
            onView: (row) => actions.openView(row.id),
            onEdit: (row) => actions.openEdit(row.id),
            onDelete: (row) => actions.requestDelete({ id: row.id, name: row.road }),
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

      <RoadFormDialog
        open={state.formOpen}
        onOpenChange={(v) => {
          if (!v) actions.closeForm();
        }}
        initial={editingFormInitial}
        onSubmit={handleSubmit}
        isPending={mut.create.isPending || mut.update.isPending}
      />

      <RoadDetailDialog
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
            <DialogTitle>删除道路</DialogTitle>
            <DialogDescription>
              {`确定删除道路「${state.deleteRow?.name ?? ""}」?此操作不可恢复。`}
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
              {`确定删除选中的 ${selectedIds.length} 条道路?此操作不可恢复。`}
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