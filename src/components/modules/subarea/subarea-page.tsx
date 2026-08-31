"use client";

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */

import { useEffect, useMemo } from "react";
import { Plus } from "lucide-react";

import {
  SubareaFormDialog,
  type SubareaDetail,
  type SubareaFormValues,
} from "./subarea-form";
import {
  SubareaStats,
} from "./subarea-stats";
import {
  SubareaTable,
  createSubareaColumns,
  type SubareaRow,
} from "./subarea-table";
import { SubareaToolbar, type RegionOption } from "./subarea-toolbar";
import { SubareaDetailDialog } from "./subarea-detail";
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

import { useSubareaState, useSubareaActions } from "./stores/subarea-store";
import { useSubareaQueryParams } from "./use-subarea-query-params";
import { useCrudExcel } from "@/lib/crud/use-crud-excel";
import { useCrudMutations } from "@/lib/crud/use-crud-mutations";
import { useCrudTable } from "@/lib/crud/use-crud-table";
import { toApiError } from "@/lib/api/error";
import { parseAliasEntries } from "@/lib/alias-entries";

import { api } from "@/trpc/react";

/**
 * 子区域页顶层编排。
 *
 * 数据流:
 *   useSubareaQueryParams (store) → submitted query params
 *     ↓
 *   tRPC useQuery (list / stats / regions / getById)
 *     ↓
 *   useCrudTable (table 实例 + 选中 + 分页/排序)
 *     ↓
 *   SubareaTable / Toolbar / PaginationControl / Stats / Dialogs
 *
 * 副作用流:
 *   useCrudMutations (create/update/delete/deleteMany)
 *     ↓ invalidate list+stats → useQuery 自动重拉
 */
export function SubareaPage() {
  // —— 1. 查询参数 store(搜索/区划/状态)——
  const filters = useSubareaQueryParams((s) => s.committed);

  // —— 2. UI store(分页/排序/选中/dialog)——
  const state = useSubareaState();
  const actions = useSubareaActions();

  // —— 3. tRPC utils ——
  const utils = api.useUtils();

  // —— 4. mutation 套件(invalidate + toast + 副作用统一)——
  const mut = useCrudMutations({
    utils,
    invalidateKeys: ["subarea"],
    procedures: {
      create: api.subarea.create,
      update: api.subarea.update,
      delete: api.subarea.delete,
      deleteMany: api.subarea.deleteMany,
    },
    messages: {
      createSuccess: "子区域已创建",
      updateSuccess: "子区域已更新",
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
      regionId: filters.regionId ?? undefined,
      status:
        filters.status === ""
          ? undefined
          : (Number(filters.status) as 0 | 1),
      sort: state.sorting.length > 0
        ? state.sorting.map((sx) => ({
            id: sx.id as
              | "name"
              | "alias"
              | "regionName"
              | "status"
              | "createdAt",
            desc: sx.desc,
          }))
        : undefined,
    }),
    [state.page, state.pageSize, state.sorting, filters],
  );

  const { data: listData, isLoading: listLoading } =
    api.subarea.list.useQuery(listQueryParas);
  const { data: stats } = api.subarea.stats.useQuery();
  const { data: regions } = api.subarea.regions.useQuery();

  // 切换筛选 → 回第一页
  useEffect(() => {
    actions.setPage(1);
  }, [filters.q, filters.regionId, filters.status, actions]);

  // —— 6. table 实例(选中/分页/排序统一)——
  const rows: SubareaRow[] = listData?.items ?? [];
  const total = listData?.total ?? 0;

  const columns = useMemo(() => createSubareaColumns(), []);

  const { table, selectedIds } = useCrudTable<SubareaRow>({
    data: rows,
    columns,
    getRowId: (r) => r.id,
    pageSize: state.pageSize,
    total,
    sorting: state.sorting,
    rowSelection: state.rowSelection,
    onSortingChange: actions.setSorting,
    onRowSelectionChange: actions.setRowSelection,
    storageKey: "subarea",
  });

  const regionOptions: RegionOption[] = useMemo(
    () => (regions ?? []).map((r) => ({ id: r.id, name: r.name })),
    [regions],
  );

  // —— 7. 编辑/详情 —— 双 useQuery(id 是 detailId / editingId)——
  const { data: detailData } = api.subarea.getById.useQuery(
    { id: state.detailId ?? "" },
    { enabled: Boolean(state.detailId) },
  );
  const { data: editingData } = api.subarea.getById.useQuery(
    { id: state.editingId ?? "" },
    { enabled: Boolean(state.editingId) },
  );

  // 编辑请求发出后,等详情加载完成,store 自动打开 form
  useEffect(() => {
    if (state.editingId && editingData) actions.openFormWhenReady();
  }, [state.editingId, editingData, actions]);

  // —— 8. 提交表单:create / update ——
  function handleSubmit(values: SubareaFormValues) {
    if (values.id) {
      mut.update.mutate({
        id: values.id,
        name: values.name,
        alias: values.alias ?? undefined,
        regionId: values.regionId ?? undefined,
        status: values.status,
        address: parseOptionalJson("address", values.address),
      });
    } else {
      mut.create.mutate({
        name: values.name,
        alias: values.alias ?? undefined,
        regionId: values.regionId ?? undefined,
        status: values.status,
        address: parseOptionalJson("address", values.address),
      });
    }
  }

  // —— 9. 导出 / 导入 套件 ——
  type ImportRowInput = {
    name: string;
    /** 多个别名以 / 分隔传入,导入时拆成数组 */
    alias?: string[];
    regionId?: string;
    status?: 0 | 1;
  };
  type ImportInput = { rows: ImportRowInput[] };

  const excel = useCrudExcel<SubareaRow, ImportRowInput, ImportInput>({
    moduleName: "子区域",
    exportColumns: [
      { header: "名称", width: 24 },
      { header: "别名", width: 20 },
      { header: "所属区划ID", width: 28 },
      { header: "状态", width: 12 },
    ],
    exportRow: (r) => ({
      "名称": r.name,
      "别名": parseAliasEntries(r.alias).join(" / "),
      "所属区划ID": r.regionId ?? "",
      "状态": r.status === 1 ? 1 : 0,
    }),
    fetchAll: () =>
      utils.subarea.exportAll
        .fetch({
          q: filters.q ?? undefined,
          regionId: filters.regionId ?? undefined,
          status:
            filters.status === ""
              ? undefined
              : (Number(filters.status) as 0 | 1),
          sort: state.sorting.map((sx) => ({
            id: sx.id as "name" | "alias" | "regionName" | "status" | "createdAt",
            desc: sx.desc,
          })),
        })
        .then((items) => items as SubareaRow[]),
    importFields: [
      { key: "name", label: "名称", required: true, width: 24 },
      { key: "alias", label: "别名", width: 20 },
      { key: "regionId", label: "所属区划ID", width: 28 },
      { key: "status", label: "状态(1启用/0禁用)", width: 20 },
    ],
    coerceRow: (r) => ({
      name: r.name ?? "",
      // Excel 单元格可能是 "/" 分隔的多个值 → 拆成数组(路由层按数组解析)
      alias: splitSlashList(r.alias),
      regionId: r.regionId ?? undefined,
      status:
        r.status === "1" ? 1 : r.status === "0" ? 0 : undefined,
    }),
    wrapInput: (rows) => ({ rows }),
    importMutation: api.subarea.import,
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
  const editingFormInitial: SubareaDetail | null =
    state.editingId && editingData ? editingData : null;
  const detail: SubareaDetail | null = detailData ?? null;
  const detailRegion = detail?.regionId
    ? regionOptions.find((r) => r.id === detail.regionId) ?? null
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        title="子区域管理"
        description="维护住宅子区域与楼宇基础信息"
        actions={
          <MotionButton onClick={actions.openCreate}>
            <Plus className="size-4" />
            新建子区域
          </MotionButton>
        }
      />

      <Reveal className="shrink-0">
        <SubareaStats stats={stats} />
      </Reveal>

      <Reveal delay={60} className="shrink-0">
        <SubareaToolbar
          regions={regionOptions}
          selectedCount={selectedIds.length}
          onCreate={actions.openCreate}
          onImport={excel.openImport}
          onExport={excel.handleExport}
          onBatchDelete={actions.requestBatchDelete}
        />
      </Reveal>

      <Reveal delay={120} className="min-h-0 flex-1">
        <SubareaTable
          table={table}
          isLoading={listLoading}
          callbacks={{
            onView: (row) => actions.openView(row.id),
            onEdit: (row) => actions.openEdit(row.id),
            onDelete: (row) => actions.requestDelete({ id: row.id, name: row.name }),
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

      <SubareaFormDialog
        open={state.formOpen}
        onOpenChange={(v) => {
          if (!v) actions.closeForm();
        }}
        initial={editingFormInitial}
        regions={regionOptions}
        onSubmit={handleSubmit}
        isPending={mut.create.isPending || mut.update.isPending}
      />

      <SubareaDetailDialog
        open={state.detailOpen}
        onOpenChange={(v) => {
          if (!v) actions.closeDetail();
        }}
        detail={
          detail
            ? {
                ...detail,
                region: detailRegion
                  ? { id: detailRegion.id, name: detailRegion.name }
                  : null,
              }
            : null
        }
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
            <DialogTitle>删除子区域</DialogTitle>
            <DialogDescription>
              {`确定删除子区域「${state.deleteRow?.name ?? ""}」?此操作不可恢复。`}
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
              {`确定删除选中的 ${selectedIds.length} 个子区域?此操作不可恢复。`}
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

/** Excel 导入:把 " / " 分隔的多个值拆成数组(导出时的反向操作) */
function splitSlashList(raw: string | undefined): string[] | undefined {
  const list = (raw ?? "")
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return list.length > 0 ? list : undefined;
}

/**
 * 把 JSON 文本解析成 zod 接受的 JSON 联合;空串 → undefined(不修改)。
 * 解析失败 → 抛 Error,被 form 的 onSubmit 截获后 toast。
 */
function parseOptionalJson(
  label: string,
  raw: string,
):
  | string
  | number
  | boolean
  | Record<string, unknown>
  | unknown[]
  | null
  | undefined {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    throw new Error(`${label} 不是合法 JSON: ${toApiError(err).message}`);
  }
}
