"use client";

import { useEffect, useMemo, useState } from "react";
import { type RowSelectionState } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { CommunityDetailDialog } from "@/components/modules/community/community-detail";
import {
  CommunityFormDialog,
  type CommunityDetail,
  type CommunityFormValues,
} from "@/components/modules/community/community-form";
import { CommunityStats } from "@/components/modules/community/community-stats";
import {
  createCommunityColumns,
  CommunityTable,
  type CommunityRow,
} from "@/components/modules/community/community-table";
import {
  CommunityToolbar,
  type RegionOption,
} from "@/components/modules/community/community-toolbar";
import { useCommunityFilters } from "@/components/modules/community/use-community-filters";
import { CsvImportDialog, type ImportResult } from "@/components/modules/community/csv-import";
import { useAppTable } from "@/lib/table";
import { PaginationControl } from "@/components/modules/community/pagination-control";
import { Button } from "@/components/ui/button";
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

type ListItem = {
  id: string;
  name: string;
  alias: string | null;
  regionId: string | null;
  regionName: string | null;
  status: number;
  createdAt: Date | string;
};

function parseOptionalJson(label: string, raw: string): unknown {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    throw new Error(
      `${label} 不是合法 JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function CommunityClient() {
  // 分页 + 筛选
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // ponytail: 筛选 state 交给 useCommunityFilters(zustand),
  // toolbar 直接读写 store,client 这里只读 committed 用于触发 query。
  const committed = useCommunityFilters((s) => s.committed);

  // 选中:交给 TanStack table 的 rowSelection 管
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  // 表单 dialog
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // 详情 dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  // 删除 confirm
  const [deleteRow, setDeleteRow] = useState<CommunityRow | null>(null);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);

  // 导入 dialog
  const [importOpen, setImportOpen] = useState(false);

  // tRPC queries
  const utils = api.useUtils();
  const listInput = useMemo(
    () => ({
      page,
      pageSize,
      q: committed.q || undefined,
      regionId: committed.regionId || undefined,
      status: committed.status === "" ? undefined : (Number(committed.status) as 0 | 1),
    }),
    [page, pageSize, committed],
  );

  const { data: listData, isLoading: listLoading } =
    api.community.list.useQuery(listInput);
  const { data: stats } = api.community.stats.useQuery();
  const { data: regions } = api.community.regions.useQuery();
  const { data: detailData } = api.community.getById.useQuery(
    { id: detailId ?? "" },
    { enabled: Boolean(detailId) },
  );
  const { data: editingData } = api.community.getById.useQuery(
    { id: editingId ?? "" },
    { enabled: Boolean(editingId) },
  );

  const regionOptions: RegionOption[] = useMemo(
    () =>
      (regions ?? []).map((r) => ({ id: r.id, name: r.name })),
    [regions],
  );

  // Mutations
  const createMut = api.community.create.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.community.list.invalidate(),
        utils.community.stats.invalidate(),
      ]);
      toast.success("小区已创建");
      setFormOpen(false);
      setEditingId(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = api.community.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.community.list.invalidate(),
        utils.community.stats.invalidate(),
      ]);
      toast.success("小区已更新");
      setFormOpen(false);
      setEditingId(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = api.community.delete.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.community.list.invalidate(),
        utils.community.stats.invalidate(),
      ]);
      toast.success("已删除");
      setDeleteRow(null);
      setRowSelection({});
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteManyMut = api.community.deleteMany.useMutation({
    onSuccess: async (res) => {
      await Promise.all([
        utils.community.list.invalidate(),
        utils.community.stats.invalidate(),
      ]);
      toast.success(`已删除 ${res.count} 条`);
      setBatchDeleteOpen(false);
      setRowSelection({});
    },
    onError: (e) => toast.error(e.message),
  });
  const importMut = api.community.import.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.community.list.invalidate(),
        utils.community.stats.invalidate(),
      ]);
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

  const rows: CommunityRow[] = useMemo(
    () =>
      (listData?.items ?? []).map((item: ListItem) => ({
        id: item.id,
        name: item.name,
        alias: item.alias,
        regionId: item.regionId,
        regionName: item.regionName,
        status: item.status,
        createdAt:
          item.createdAt instanceof Date
            ? item.createdAt
            : new Date(item.createdAt),
      })),
    [listData?.items],
  );

  const total = listData?.total ?? 0;

  const columns = useMemo(
    () =>
      createCommunityColumns({
        onView: openView,
        onEdit: openEdit,
        onDelete: handleDelete,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const table = useAppTable({
    data: rows,
    columns,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.id,
    enableRowSelection: true,
  });

  const selectedIds = table.getSelectedRowModel().rows.map((r) => r.original.id);
  const selectCount = selectedIds.length;

  function openCreate() {
    setEditingId(null);
    setFormOpen(true);
  }
  function openEdit(row: CommunityRow) {
    setEditingId(row.id);
  }

  function openView(row: CommunityRow) {
    setDetailId(row.id);
    setDetailOpen(true);
  }

  function handleSubmit(values: CommunityFormValues) {
    let address: unknown;
    let geom: unknown;
    try {
      address = parseOptionalJson("address", values.address);
      geom = parseOptionalJson("geom", values.geom);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      return;
    }

    const addr = (address ?? null) as never;
    const geomVal = (geom ?? null) as never;

    if (values.id) {
      updateMut.mutate({
        id: values.id,
        name: values.name,
        alias: values.alias || undefined,
        regionId: values.regionId || undefined,
        status: values.status,
        address: addr,
        geom: geomVal,
      });
    } else {
      createMut.mutate({
        name: values.name,
        alias: values.alias || undefined,
        regionId: values.regionId || undefined,
        status: values.status,
        address: addr,
        geom: geomVal,
      });
    }
  }

  function handleDelete(row: CommunityRow) {
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
    rows: Array<{
      name: string;
      alias?: string;
      regionId?: string;
      status?: number;
    }>,
  ): Promise<ImportResult | undefined> {
    const coerced = rows.map((r) => {
      const status: 0 | 1 | undefined =
        r.status === 0 ? 0 : r.status === 1 ? 1 : undefined;
      return {
        name: r.name,
        alias: r.alias,
        regionId: r.regionId,
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

  const editingFormInitial = useMemo<CommunityDetail | null>(() => {
    if (!editingId) return null;
    if (!editingData) return null;
    return {
      id: editingData.id,
      name: editingData.name,
      alias: editingData.alias,
      regionId: editingData.regionId,
      status: editingData.status,
      address: editingData.address,
      geom: editingData.geom,
      createdAt:
        editingData.createdAt instanceof Date
          ? editingData.createdAt
          : new Date(editingData.createdAt),
      updatedAt:
        editingData.updatedAt instanceof Date
          ? editingData.updatedAt
          : new Date(editingData.updatedAt),
    };
  }, [editingId, editingData]);

  const detail = useMemo<CommunityDetail | null>(() => {
    if (!detailData) return null;
    return {
      id: detailData.id,
      name: detailData.name,
      alias: detailData.alias,
      regionId: detailData.regionId,
      status: detailData.status,
      address: detailData.address,
      geom: detailData.geom,
      createdAt:
        detailData.createdAt instanceof Date
          ? detailData.createdAt
          : new Date(detailData.createdAt),
      updatedAt:
        detailData.updatedAt instanceof Date
          ? detailData.updatedAt
          : new Date(detailData.updatedAt),
    };
  }, [detailData]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="小区管理"
        description="维护住宅小区与楼宇基础信息"
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            新建小区
          </Button>
        }
      />

      <Reveal>
        <CommunityStats stats={stats} />
      </Reveal>

      <Reveal delay={60}>
        <CommunityToolbar
          regions={regionOptions}
          selectedCount={selectCount}
          onCreate={openCreate}
          onImport={() => setImportOpen(true)}
          onBatchDelete={handleBatchDelete}
        />
      </Reveal>

      <Reveal delay={120}>
        <CommunityTable table={table} isLoading={listLoading} />
      </Reveal>

      <Reveal delay={180}>
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
      </Reveal>

      <CommunityFormDialog
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

      <CommunityDetailDialog
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

      <CsvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onSubmit={handleImport}
        isPending={importMut.isPending}
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
            <DialogTitle>删除小区</DialogTitle>
            <DialogDescription>
              {`确定删除小区「${deleteRow?.name ?? ""}」?此操作不可恢复。`}
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
              {`确定删除选中的 ${selectCount} 个小区?此操作不可恢复。`}
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
