"use client";

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";

import {
  StdAddressFormDialog,
  type StdAddressDetail,
  type StdAddressFormValues,
} from "./std-address-form";
import { StdAddressStats } from "./std-address-stats";
import {
  StdAddressTable,
  createStdAddressColumns,
  type StdAddressRow,
} from "./std-address-table";
import { StdAddressToolbar } from "./std-address-toolbar";
import { StdAddressDetailDialog } from "./std-address-detail";
import { StdAddressImportDialog } from "./std-address-import-dialog";
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

import {
  useStdAddressState,
  useStdAddressActions,
  type StdAddressSortId,
} from "./stores/std-address-store";
import { useStdAddressQueryParams } from "./use-std-address-query-params";
import { useCrudExcel } from "@/lib/crud/use-crud-excel";
import { useCrudMutations } from "@/lib/crud/use-crud-mutations";
import { useCrudTable } from "@/lib/crud/use-crud-table";
import { toApiError } from "@/lib/api/error";
import { toast } from "sonner";

import { api } from "@/trpc/react";

/**
 * 标准地址库页顶层编排。
 *
 * 数据流:
 *   useStdAddressQueryParams (store) → submitted query params
 *     ↓
 *   tRPC useQuery (list / stats / getById)
 *     ↓
 *   useCrudTable (table 实例 + 选中 + 分页/排序)
 *     ↓
 *   StdAddressTable / Toolbar / PaginationControl / Stats / Dialogs
 *
 * 副作用流:
 *   useCrudMutations (create/update/delete/deleteMany)
 *   批量标准化 standardizeBatch(独立 mutation:逐条调 ML 服务后落库)
 *     ↓ invalidate list+stats → useQuery 自动重拉
 */
export function StdAddressPage() {
  // —— 1. 查询参数 store(搜索/状态)——
  const filters = useStdAddressQueryParams((s) => s.committed);

  // —— 2. UI store(分页/排序/选中/dialog)——
  const state = useStdAddressState();
  const actions = useStdAddressActions();

  // —— 3. tRPC utils ——
  const utils = api.useUtils();

  // —— 4. mutation 套件(invalidate + toast + 副作用统一)——
  const mut = useCrudMutations({
    utils,
    invalidateKeys: ["stdAddress"],
    procedures: {
      create: api.stdAddress.create,
      update: api.stdAddress.update,
      delete: api.stdAddress.delete,
      deleteMany: api.stdAddress.deleteMany,
    },
    messages: {
      createSuccess: "地址记录已创建",
      updateSuccess: "地址记录已更新",
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

  // —— 4.5 批量标准化(独立 mutation:逐条调 ML 服务,成功后整体失效)——
  const batchStandardize = api.stdAddress.standardizeBatch.useMutation({
    onSuccess: async (res) => {
      // tRPC proxy 命名空间顶层 invalidate():前缀匹配失效该命名空间全部查询
      await utils.stdAddress.invalidate();
      toast.success(
        res.failed > 0
          ? `已标准化 ${res.done} 条 · 失败 ${res.failed} 条`
          : `已标准化 ${res.done} 条`,
      );
      actions.clearSelection();
    },
    onError: (e) => toast.error(toApiError(e).message),
  });

  // —— 4.6 导入(选列式 dialog,参考 addr-model):只落原始地址 ——
  const [importOpen, setImportOpen] = useState(false);
  const importMut = api.stdAddress.import.useMutation({
    onSuccess: async (res) => {
      await utils.stdAddress.invalidate();
      toast.success(
        res.errors.length > 0
          ? `已导入 ${res.created} 条 · 失败 ${res.errors.length} 条`
          : `已导入 ${res.created} 条`,
      );
      setImportOpen(false);
      actions.setPage(1);
    },
    onError: (e) => toast.error(toApiError(e).message),
  });

  function handleImportAddresses(addresses: string[]) {
    importMut.mutate({
      rows: addresses.map((a) => ({ rawAddress: a })),
      // 只落原始地址;标准地址与评分由「批量标准化」统一生成
      autoStandardize: false,
    });
  }

  // —— 5. 列表查询 ——
  const listQueryParas = useMemo(
    () => ({
      page: state.page,
      pageSize: state.pageSize,
      // 空串后端视为无筛选(buildWhere 判 falsy)
      keyword: filters.q,
      status:
        filters.status === ""
          ? undefined
          : (Number(filters.status) as 0 | 1),
      scoreMin: scoreFilter(filters.scoreMin),
      scoreMax: scoreFilter(filters.scoreMax),
      sort: state.sorting.length > 0
        ? state.sorting.map((sx) => ({
            id: sx.id as StdAddressSortId,
            desc: sx.desc,
          }))
        : undefined,
    }),
    [state.page, state.pageSize, state.sorting, filters],
  );

  const { data: listData, isLoading: listLoading } =
    api.stdAddress.list.useQuery(listQueryParas);
  const { data: stats } = api.stdAddress.stats.useQuery();

  // 切换筛选 → 回第一页
  useEffect(() => {
    actions.setPage(1);
  }, [filters.q, filters.status, filters.scoreMin, filters.scoreMax, actions]);

  // —— 6. table 实例(选中/分页/排序统一)——
  const rows: StdAddressRow[] = listData?.items ?? [];
  const total = listData?.total ?? 0;

  const columns = useMemo(() => createStdAddressColumns(), []);

  const { table, selectedIds } = useCrudTable<StdAddressRow>({
    data: rows,
    columns,
    getRowId: (r) => r.id,
    pageSize: state.pageSize,
    total,
    sorting: state.sorting,
    rowSelection: state.rowSelection,
    onSortingChange: actions.setSorting,
    onRowSelectionChange: actions.setRowSelection,
    storageKey: "std-address",
  });

  // —— 7. 编辑/详情 —— 双 useQuery(id 是 detailId / editingId)——
  const { data: detailData } = api.stdAddress.getById.useQuery(
    { id: state.detailId ?? "" },
    { enabled: Boolean(state.detailId) },
  );
  const { data: editingData } = api.stdAddress.getById.useQuery(
    { id: state.editingId ?? "" },
    { enabled: Boolean(state.editingId) },
  );

  // 编辑请求发出后,等详情加载完成,store 自动打开 form
  useEffect(() => {
    if (state.editingId && editingData) actions.openFormWhenReady();
  }, [state.editingId, editingData, actions]);

  // —— 8. 提交表单:create / update ——
  function handleSubmit(values: StdAddressFormValues) {
    const stdAddress = values.stdAddress.trim() || undefined;
    const stdScore =
      values.stdScore.trim() === "" ? undefined : Number(values.stdScore);
    if (values.id) {
      mut.update.mutate({
        id: values.id,
        stdAddress,
        stdScore,
        status: values.status,
      });
    } else {
      mut.create.mutate({
        rawAddress: values.rawAddress,
        stdAddress,
        stdScore,
        status: values.status,
      });
    }
  }

  // —— 9. 导出 / 导入 套件 ——
  // 导入只收"原始地址"一列(参考 addr-model 的导入形态):
  // 标准地址/评分不手工填,入库后由列表「批量标准化」统一生成
  type ImportRowInput = {
    rawAddress: string;
  };
  type ImportInput = { rows: ImportRowInput[]; autoStandardize: boolean };

  const excel = useCrudExcel<StdAddressRow, ImportRowInput, ImportInput>({
    moduleName: "标准地址",
    exportColumns: [
      { header: "原始地址", width: 44 },
      { header: "标准地址", width: 44 },
      { header: "标准评分", width: 12 },
      { header: "状态", width: 12 },
    ],
    exportRow: (r) => ({
      "原始地址": r.rawAddress,
      "标准地址": r.stdAddress ?? "",
      "标准评分": scoreToExcel(r.stdScore),
      "状态": r.status === 1 ? 1 : 0,
    }),
    fetchAll: () =>
      utils.stdAddress.exportAll.fetch({
        keyword: filters.q,
        status:
          filters.status === ""
            ? undefined
            : (Number(filters.status) as 0 | 1),
        scoreMin: scoreFilter(filters.scoreMin),
        scoreMax: scoreFilter(filters.scoreMax),
        sort: state.sorting.map((sx) => ({
          id: sx.id as StdAddressSortId,
          desc: sx.desc,
        })),
      }),
    importFields: [
      // Hook 类型必填的最小定义;导入交互实际由 StdAddressImportDialog 承担(选列式),
      // 此处保留单列模板以兼容固定模板导入场景
      { key: "rawAddress", label: "原始地址", required: true, width: 44 },
    ],
    coerceRow: (r) => ({
      rawAddress: r.rawAddress ?? "",
    }),
    wrapInput: (rows) => ({ rows, autoStandardize: false }),
    importMutation: api.stdAddress.import,
  });

  // —— 10. 删除确认 ——
  function confirmDelete() {
    if (state.deleteRow) mut.remove.mutate({ id: state.deleteRow.id });
  }
  function confirmBatchDelete() {
    if (selectedIds.length === 0) return;
    mut.removeMany.mutate({ ids: selectedIds });
  }

  // —— 11. 批量标准化 ——
  function handleBatchStandardize() {
    if (selectedIds.length === 0) return;
    batchStandardize.mutate({ ids: selectedIds });
  }

  // —— 12. 派生显示数据 ——
  const editingFormInitial: StdAddressDetail | null =
    state.editingId && editingData ? editingData : null;
  const detail: StdAddressDetail | null = detailData ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        title="标准地址库"
        description="原始地址标准化与评分管理"
        actions={
          <MotionButton onClick={actions.openCreate}>
            <Plus className="size-4" />
            新建
          </MotionButton>
        }
      />

      <Reveal className="shrink-0">
        <StdAddressStats stats={stats} />
      </Reveal>

      <Reveal delay={60} className="shrink-0">
        <StdAddressToolbar
          selectedCount={selectedIds.length}
          isStandardizing={batchStandardize.isPending}
          onCreate={actions.openCreate}
          onImport={() => setImportOpen(true)}
          onExport={excel.handleExport}
          onBatchDelete={actions.requestBatchDelete}
          onBatchStandardize={handleBatchStandardize}
        />
      </Reveal>

      <Reveal delay={120} className="min-h-0 flex-1">
        <StdAddressTable
          table={table}
          isLoading={listLoading}
          callbacks={{
            onView: (row) => actions.openView(row.id),
            onEdit: (row) => actions.openEdit(row.id),
            onDelete: (row) =>
              actions.requestDelete({ id: row.id, name: row.rawAddress }),
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

      <StdAddressFormDialog
        open={state.formOpen}
        onOpenChange={(v) => {
          if (!v) actions.closeForm();
        }}
        initial={editingFormInitial}
        onSubmit={handleSubmit}
        isPending={mut.create.isPending || mut.update.isPending}
      />

      <StdAddressDetailDialog
        open={state.detailOpen}
        onOpenChange={(v) => {
          if (!v) actions.closeDetail();
        }}
        detail={detail}
      />

      <StdAddressImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={handleImportAddresses}
        isPending={importMut.isPending}
      />

      {/* 单条删除 confirm */}
      <Dialog
        open={Boolean(state.deleteRow)}
        onOpenChange={(v) => {
          if (!v) actions.cancelDelete();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除记录</DialogTitle>
            <DialogDescription>
              {`确定删除「${state.deleteRow?.name ?? ""}」?此操作不可恢复。`}
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
              {`确定删除选中的 ${selectedIds.length} 条记录?此操作不可恢复。`}
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

/** 评分 → Excel 单元格(Decimal 可能是 string/number;空显示空串) */
function scoreToExcel(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  return Number.isNaN(n) ? "" : n.toFixed(1);
}

/** 评分筛选输入 → 数字;空串 / 非法输入 → undefined(不限) */
function scoreFilter(v: string | undefined): number | undefined {
  const trimmed = (v ?? "").trim();
  if (trimmed === "") return undefined;
  const n = Number(trimmed);
  return Number.isNaN(n) ? undefined : n;
}