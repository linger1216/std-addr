"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import {
  CsvImportDialog,
  type ImportResult,
  type ImportRow,
} from "@/components/modules/shared/csv-import";
import { PaginationControl } from "@/components/modules/shared/pagination-control";
import {
  RoadFormDialog,
  type RoadDetail,
  type RoadFormValues,
} from "@/components/modules/road/road-form";
import { RoadDetailDialog } from "@/components/modules/road/road-detail";
import { RoadStats } from "@/components/modules/road/road-stats";
import { RoadTable, type RoadRow } from "@/components/modules/road/road-table";
import {
  EMPTY_FILTERS,
  type RoadFilters,
  RoadToolbar,
} from "@/components/modules/road/road-toolbar";
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
  road: string;
  status: number;
  createdAt: Date | string | null;
};

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  return v instanceof Date ? v : new Date(v);
}

export function RoadClient() {
  // 分页 + 筛选
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<RoadFilters>(EMPTY_FILTERS);
  const [committed, setCommitted] = useState<RoadFilters>(EMPTY_FILTERS);

  // 选中
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // 表单 dialog
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // 详情 dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  // 删除 confirm
  const [deleteRow, setDeleteRow] = useState<RoadRow | null>(null);
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
      status: committed.status === "" ? undefined : (Number(committed.status) as 0 | 1),
    }),
    [page, pageSize, committed],
  );

  const { data: listData, isLoading: listLoading } =
    api.road.list.useQuery(listInput);
  const { data: stats } = api.road.stats.useQuery();
  const { data: detailData } = api.road.getById.useQuery(
    { id: detailId ?? "" },
    { enabled: Boolean(detailId) },
  );
  const { data: editingData } = api.road.getById.useQuery(
    { id: editingId ?? "" },
    { enabled: Boolean(editingId) },
  );

  // Mutations
  const createMut = api.road.create.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.road.list.invalidate(),
        utils.road.stats.invalidate(),
      ]);
      toast.success("道路已创建");
      setFormOpen(false);
      setEditingId(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = api.road.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.road.list.invalidate(),
        utils.road.stats.invalidate(),
      ]);
      toast.success("道路已更新");
      setFormOpen(false);
      setEditingId(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = api.road.delete.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.road.list.invalidate(),
        utils.road.stats.invalidate(),
      ]);
      toast.success("已删除");
      setDeleteRow(null);
      setSelected(new Set());
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteManyMut = api.road.deleteMany.useMutation({
    onSuccess: async (res) => {
      await Promise.all([
        utils.road.list.invalidate(),
        utils.road.stats.invalidate(),
      ]);
      toast.success(`已删除 ${res.count} 条`);
      setBatchDeleteOpen(false);
      setSelected(new Set());
    },
    onError: (e) => toast.error(e.message),
  });
  const importMut = api.road.import.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.road.list.invalidate(),
        utils.road.stats.invalidate(),
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

  // 数据切换时丢掉过期的选中
  useEffect(() => {
    if (!listData?.items) return;
    const valid = new Set(listData.items.map((i) => i.id));
    setSelected((prev) => {
      const next = new Set<string>();
      prev.forEach((id) => {
        if (valid.has(id)) next.add(id);
      });
      return next;
    });
  }, [listData?.items]);

  const rows: RoadRow[] = useMemo(
    () =>
      (listData?.items ?? []).map((item: ListItem) => ({
        id: item.id,
        road: item.road,
        status: item.status,
        createdAt: toDate(item.createdAt),
      })),
    [listData?.items],
  );

  const total = listData?.total ?? 0;
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function handleToggleAll(next: boolean) {
    if (next) {
      setSelected(new Set(rows.map((r) => r.id)));
    } else {
      setSelected(new Set());
    }
  }
  function handleToggleOne(id: string, next: boolean) {
    setSelected((prev) => {
      const ns = new Set(prev);
      if (next) ns.add(id);
      else ns.delete(id);
      return ns;
    });
  }

  function openCreate() {
    setEditingId(null);
    setFormOpen(true);
  }
  function openEdit(row: RoadRow) {
    setEditingId(row.id);
  }

  function openView(row: RoadRow) {
    setDetailId(row.id);
    setDetailOpen(true);
  }

  function handleSubmit(values: RoadFormValues) {
    if (values.id) {
      updateMut.mutate({
        id: values.id,
        road: values.road,
        status: values.status,
      });
    } else {
      createMut.mutate({ road: values.road, status: values.status });
    }
  }

  function handleDelete(row: RoadRow) {
    setDeleteRow(row);
  }
  function confirmDelete() {
    if (deleteRow) deleteMut.mutate({ id: deleteRow.id });
  }

  function handleBatchDelete() {
    setBatchDeleteOpen(true);
  }
  function confirmBatchDelete() {
    if (selected.size === 0) return;
    deleteManyMut.mutate({ ids: Array.from(selected) });
  }

  async function handleImport(
    rows: ImportRow[],
  ): Promise<ImportResult | undefined> {
    const coerced = rows.map((r) => {
      const status: 0 | 1 | undefined =
        r.status === "0" ? 0 : r.status === "1" ? 1 : undefined;
      return { road: r.name ?? "", status };
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

  function handleReset() {
    setFilters(EMPTY_FILTERS);
    setCommitted(EMPTY_FILTERS);
    setPage(1);
  }

  function handleSubmitSearch() {
    setCommitted(filters);
    setPage(1);
  }

  const editingFormInitial = useMemo<RoadDetail | null>(() => {
    if (!editingId) return null;
    if (!editingData) return null;
    return {
      id: editingData.id,
      road: editingData.road,
      status: editingData.status,
      createdAt: toDate(editingData.createdAt),
      updatedAt: toDate(editingData.updatedAt),
    };
  }, [editingId, editingData]);

  const detail = useMemo<RoadDetail | null>(() => {
    if (!detailData) return null;
    return {
      id: detailData.id,
      road: detailData.road,
      status: detailData.status,
      createdAt: toDate(detailData.createdAt),
      updatedAt: toDate(detailData.updatedAt),
    };
  }, [detailData]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="道路管理"
        description="维护道路名、起止点与走向"
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            新建道路
          </Button>
        }
      />

      <Reveal>
        <RoadStats stats={stats} />
      </Reveal>

      <Reveal delay={60}>
        <RoadToolbar
          filters={filters}
          onChange={setFilters}
          onReset={handleReset}
          onSubmit={handleSubmitSearch}
          selectedCount={selected.size}
          onCreate={openCreate}
          onImport={() => setImportOpen(true)}
          onBatchDelete={handleBatchDelete}
        />
      </Reveal>

      <Reveal delay={120}>
        <RoadTable
          rows={rows}
          isLoading={listLoading}
          selectedIds={selected}
          onToggleAll={handleToggleAll}
          onToggleOne={handleToggleOne}
          allSelected={allSelected}
          onView={openView}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
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

      <RoadFormDialog
        open={formOpen}
        onOpenChange={(v) => {
          setFormOpen(v);
          if (!v) setEditingId(null);
        }}
        initial={editingFormInitial}
        onSubmit={handleSubmit}
        isPending={createMut.isPending || updateMut.isPending}
      />

      <RoadDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        detail={detail}
      />

      <CsvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="导入道路"
        description="支持 CSV(header: name,status)或 JSON 数组。"
        fields={[
          { key: "name", label: "道路名", required: true },
          { key: "status", label: "状态" },
        ]}
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
            <DialogTitle>删除道路</DialogTitle>
            <DialogDescription>
              {`确定删除道路「${deleteRow?.road ?? ""}」?此操作不可恢复。`}
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
              {`确定删除选中的 ${selected.size} 条道路?此操作不可恢复。`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBatchDeleteOpen(false)}>
              取消
            </Button>
            <Button
              onClick={confirmBatchDelete}
              disabled={deleteManyMut.isPending || selected.size === 0}
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