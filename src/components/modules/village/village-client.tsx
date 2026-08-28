"use client";

import { useEffect, useMemo, useState } from "react";
import { type RowSelectionState, type SortingState } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import {
  ExcelImportDialog,
  type ImportResult,
  type ImportRow,
} from "@/components/modules/shared/excel-import";
import { PaginationControl } from "@/components/modules/shared/pagination-control";
import { VillageDetailDialog } from "@/components/modules/village/village-detail";
import {
  VillageFormDialog,
  type VillageDetail,
  type VillageFormValues,
} from "@/components/modules/village/village-form";
import { VillageStats } from "@/components/modules/village/village-stats";
import {
  createVillageColumns,
  VillageTable,
  type VillageRow,
} from "@/components/modules/village/village-table";
import {
  type RegionOption,
  VillageToolbar,
} from "@/components/modules/village/village-toolbar";
import { useVillageQueryParams } from "@/components/modules/village/use-village-query-params";
import { useAppTable } from "@/lib/table";
import { toErrorMessage } from "@/lib/constants";
import { Button, MotionButton } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/layout/page-header";
import { Reveal } from "@/components/ui/reveal";
import { api } from "@/trpc/react";

function parseOptionalJson(label: string, raw: string): unknown {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    throw new Error(`${label} 不是合法 JSON: ${toErrorMessage(err)}`);
  }
}

export function VillageClient() {
  // 分页 + 筛选
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const committed = useVillageQueryParams((s) => s.committed);

  // 选中:交给 TanStack rowSelection
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  // 排序:手动排序由 server 执行
  const [sorting, setSorting] = useState<SortingState>([]);

  // 表单 dialog
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // 详情 dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  // 删除 confirm
  const [deleteRow, setDeleteRow] = useState<VillageRow | null>(null);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);

  // 导入 dialog
  const [importOpen, setImportOpen] = useState(false);

  // tRPC queries
  const rpc = api.useUtils();
  const listInput = useMemo(
    () => ({
      page,
      pageSize,
      q: committed.q || undefined,
      regionId: committed.regionId || undefined,
      status: committed.status === "" ? undefined : (Number(committed.status) as 0 | 1),
      sort: sorting.length > 0
        ? sorting.map((sx) => ({
            id: sx.id as "name" | "alias" | "regionName" | "status" | "createdAt",
            desc: sx.desc,
          }))
        : undefined,
    }),
    [page, pageSize, committed, sorting],
  );

  const { data: listData, isLoading: listLoading } =
    api.village.list.useQuery(listInput);
  const { data: stats } = api.village.stats.useQuery();
  const { data: regions } = api.village.regions.useQuery();
  const { data: detailData } = api.village.getById.useQuery(
    { id: detailId ?? "" },
    { enabled: Boolean(detailId) },
  );
  const { data: editingData } = api.village.getById.useQuery(
    { id: editingId ?? "" },
    { enabled: Boolean(editingId) },
  );

  const regionOptions: RegionOption[] = useMemo(
    () => (regions ?? []).map((r) => ({ id: r.id, name: r.name })),
    [regions],
  );

  const invalidateList = async () => {
    await Promise.all([
      rpc.village.list.invalidate(),
      rpc.village.stats.invalidate(),
    ]);
  };

  // Mutations
  const createMut = api.village.create.useMutation({
    onSuccess: async () => {
      await invalidateList();
      toast.success("村已创建");
      setFormOpen(false);
      setEditingId(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = api.village.update.useMutation({
    onSuccess: async () => {
      await invalidateList();
      toast.success("村已更新");
      setFormOpen(false);
      setEditingId(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = api.village.delete.useMutation({
    onSuccess: async () => {
      await invalidateList();
      toast.success("已删除");
      setDeleteRow(null);
      setRowSelection({});
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteManyMut = api.village.deleteMany.useMutation({
    onSuccess: async (res) => {
      await invalidateList();
      toast.success(`已删除 ${res.count} 条`);
      setBatchDeleteOpen(false);
      setRowSelection({});
    },
    onError: (e) => toast.error(e.message),
  });
  const importMut = api.village.import.useMutation({
    onSuccess: async () => {
      await invalidateList();
    },
    onError: (e) => toast.error(e.message),
  });

  // 切换筛选后回到第一页
  useEffect(() => {
    setPage(1);
  }, [committed]);

  // 选中编辑后,等详情加载完成再打开表单
  useEffect(() => {
    if (!editingId) return;
    if (!editingData) return;
    setFormOpen(true);
  }, [editingId, editingData]);

  // 排序变化回到第一页
  useEffect(() => {
    setPage(1);
  }, [sorting]);

  // 类型来自 router 输出(superjson 已转 Date),不必手写 map
  const rows: VillageRow[] = listData?.items ?? [];

  const total = listData?.total ?? 0;

  // 列定义缓存
  const columns = useMemo(
    () =>
      createVillageColumns({
        onView: openView,
        onEdit: openEdit,
        onDelete: handleDelete,
      }),
     
    [],
  );

  const table = useAppTable({
    data: rows,
    columns,
    state: { rowSelection, sorting },
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    getRowId: (row) => row.id,
    enableRowSelection: true,
    manualSorting: true,
  });

  const selectedIds = table.getSelectedRowModel().rows.map((r) => r.original.id);
  const selectCount = selectedIds.length;

  function openCreate() {
    setEditingId(null);
    setFormOpen(true);
  }
  function openEdit(row: VillageRow) {
    setEditingId(row.id);
  }

  function openView(row: VillageRow) {
    setDetailId(row.id);
    setDetailOpen(true);
  }

  function handleSubmit(values: VillageFormValues) {
    // geom: 后端 DDL 是 GEOMCOLLECTION,Prisma 暂不支持;不传
    if (values.id) {
      updateMut.mutate({
        id: values.id,
        name: values.name,
        alias: values.alias || undefined,
        regionId: values.regionId || undefined,
        status: values.status,
      });
    } else {
      createMut.mutate({
        name: values.name,
        alias: values.alias || undefined,
        regionId: values.regionId || undefined,
        status: values.status,
      });
    }
  }

  function handleDelete(row: VillageRow) {
    setDeleteRow(row);
  }
  function confirmDelete() {
    if (deleteRow) deleteMut.mutate({ id: deleteRow.id });
  }

  function handleBatchDelete() {
    setBatchDeleteOpen(true);
  }
  function confirmBatchDelete() {
    if (selectCount === 0) return;
    deleteManyMut.mutate({ ids: selectedIds });
  }

  async function handleImport(
    rows: ImportRow[],
  ): Promise<ImportResult | undefined> {
    const coerced = rows.map((r) => {
      const rawStatus = Number(r.status);
      const status: 0 | 1 | undefined =
        rawStatus === 0 || rawStatus === 1 ? rawStatus : undefined;
      return {
        name: r.name ?? "",
        alias: r.alias || undefined,
        regionId: r.regionId || undefined,
        status,
      };
    });
    return new Promise<ImportResult | undefined>((resolve) => {
      importMut.mutate(
        { rows: coerced },
        {
          onSuccess: (res) => {
            toast.success(
              res.errors.length > 0
                ? `已导入 ${res.created} 条 · 失败 ${res.errors.length} 条`
                : `已导入 ${res.created} 条`,
            );
            resolve(res);
          },
          onError: (e) => {
            toast.error(e.message);
            resolve(undefined);
          },
        },
      );
    });
  }

  /** 导出当前筛选条件下的全部村到 .xlsx */
  async function handleExport() {
    try {
      const items = await rpc.village.exportAll.fetch({
        q: committed.q || undefined,
        regionId: committed.regionId || undefined,
        status:
          committed.status === ""
            ? undefined
            : (Number(committed.status) as 0 | 1),
        sort:
          sorting.length > 0
            ? sorting.map((sx) => ({
                id: sx.id as "name" | "alias" | "regionName" | "status" | "createdAt",
                desc: sx.desc,
              }))
            : undefined,
      });

      const rows = items.map((it) => ({
        "名称": it.name,
        "别名": it.alias ?? "",
        "所属区划ID": it.regionId ?? "",
        "状态": it.status === 1 ? 1 : 0,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [{ wch: 24 }, { wch: 20 }, { wch: 28 }, { wch: 18 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "村");
      XLSX.writeFile(wb, `村_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success(`已导出 ${rows.length} 条`);
    } catch (err) {
      toast.error(toErrorMessage(err));
    }
  }

  // getById 输出即 VillageDetail(superjson 已转 Date)
  const editingFormInitial: VillageDetail | null = editingId && editingData
    ? (editingData)
    : null;

  const detail: VillageDetail | null = detailData
    ? (detailData)
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        title="村管理"
        description="维护自然村与行政村基础信息"
        actions={
          <MotionButton onClick={openCreate}>
            <Plus className="size-4" />
            新建村
          </MotionButton>
        }
      />

      <Reveal className="shrink-0">
        <VillageStats stats={stats} />
      </Reveal>

      <Reveal delay={60} className="shrink-0">
        <VillageToolbar
          regions={regionOptions}
          selectedCount={selectCount}
          onCreate={openCreate}
          onImport={() => setImportOpen(true)}
          onExport={handleExport}
          onBatchDelete={handleBatchDelete}
        />
      </Reveal>

      <Reveal delay={120} className="min-h-0 flex-1">
        <VillageTable table={table} isLoading={listLoading} />
      </Reveal>

      <div className="shrink-0">
        <PaginationControl
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(1);
          }}
        />
      </div>

      <VillageFormDialog
        open={formOpen}
        onOpenChange={(v) => {
          setFormOpen(v);
          if (!v) setEditingId(null);
        }}
        initial={editingFormInitial}
        regions={regionOptions}
        onSubmit={handleSubmit}
        isPending={createMut.isPending || updateMut.isPending}
      />

      <VillageDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        detail={
          detail
            ? {
                ...detail,
                region: detail.regionId
                  ? regionOptions.find((r) => r.id === detail.regionId)
                    ? {
                        id: detail.regionId,
                        name:
                          regionOptions.find((r) => r.id === detail.regionId)
                            ?.name ?? "",
                      }
                    : null
                  : null,
              }
            : null
        }
      />

      <ExcelImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="导入村"
        description="仅支持 Excel(.xlsx/.xls)。可先下载模板填写后导入。"
        fields={[
          { key: "name", label: "名称", required: true, width: 24 },
          { key: "alias", label: "别名", width: 20 },
          { key: "regionId", label: "所属区划ID", width: 28 },
          { key: "status", label: "状态(1启用/0禁用)", width: 20 },
        ]}
        onSubmit={handleImport}
        isPending={importMut.isPending}
        fileNamePrefix="村导入模板"
      />

      {/* 单条删除 confirm */}
      <Dialog
        open={Boolean(deleteRow)}
        onOpenChange={(v) => {
          if (!v) setDeleteRow(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除村</DialogTitle>
            <DialogDescription>
              {`确定删除村「${deleteRow?.name ?? ""}」?此操作不可恢复。`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteRow(null)}>
              取消
            </Button>
            <Button
              onClick={confirmDelete}
              disabled={deleteMut.isPending}
              className="bg-danger text-white hover:bg-danger/90"
            >
              {deleteMut.isPending ? "删除中…" : "删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批量删除 confirm */}
      <Dialog open={batchDeleteOpen} onOpenChange={setBatchDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>批量删除</DialogTitle>
            <DialogDescription>
              {`确定删除选中的 ${selectCount} 个村?此操作不可恢复。`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBatchDeleteOpen(false)}>
              取消
            </Button>
            <Button
              onClick={confirmBatchDelete}
              disabled={deleteManyMut.isPending || selectCount === 0}
              className="bg-danger text-white hover:bg-danger/90"
            >
              {deleteManyMut.isPending ? "删除中…" : "删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}