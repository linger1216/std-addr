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
import { VillageDetailDialog } from "@/components/modules/village/village-detail";
import {
  VillageFormDialog,
  type VillageDetail,
  type VillageFormValues,
} from "@/components/modules/village/village-form";
import { VillageStats } from "@/components/modules/village/village-stats";
import {
  VillageTable,
  type VillageRow,
} from "@/components/modules/village/village-table";
import {
  type RegionOption,
  VillageToolbar,
} from "@/components/modules/village/village-toolbar";
import { useVillageFilters } from "@/components/modules/village/use-village-filters";
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

export function VillageClient() {
  // 分页 + 筛选
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // ponytail: 筛选 state 由 useVillageFilters(zustand) 管理
  const committed = useVillageFilters((s) => s.committed);

  // 选中
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  // Mutations
  const createMut = api.village.create.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.village.list.invalidate(),
        utils.village.stats.invalidate(),
      ]);
      toast.success("村已创建");
      setFormOpen(false);
      setEditingId(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = api.village.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.village.list.invalidate(),
        utils.village.stats.invalidate(),
      ]);
      toast.success("村已更新");
      setFormOpen(false);
      setEditingId(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = api.village.delete.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.village.list.invalidate(),
        utils.village.stats.invalidate(),
      ]);
      toast.success("已删除");
      setDeleteRow(null);
      setSelected(new Set());
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteManyMut = api.village.deleteMany.useMutation({
    onSuccess: async (res) => {
      await Promise.all([
        utils.village.list.invalidate(),
        utils.village.stats.invalidate(),
      ]);
      toast.success(`已删除 ${res.count} 条`);
      setBatchDeleteOpen(false);
      setSelected(new Set());
    },
    onError: (e) => toast.error(e.message),
  });
  const importMut = api.village.import.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.village.list.invalidate(),
        utils.village.stats.invalidate(),
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

  const rows: VillageRow[] = useMemo(
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
  function openEdit(row: VillageRow) {
    setEditingId(row.id);
  }

  function openView(row: VillageRow) {
    setDetailId(row.id);
    setDetailOpen(true);
  }

  function handleSubmit(values: VillageFormValues) {
    let geom: unknown;
    try {
      geom = parseOptionalJson("geom", values.geom);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      return;
    }

    const geomVal = (geom ?? null) as never;

    if (values.id) {
      updateMut.mutate({
        id: values.id,
        name: values.name,
        alias: values.alias || undefined,
        regionId: values.regionId || undefined,
        status: values.status,
        geom: geomVal,
      });
    } else {
      createMut.mutate({
        name: values.name,
        alias: values.alias || undefined,
        regionId: values.regionId || undefined,
        status: values.status,
        geom: geomVal,
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
    if (selected.size === 0) return;
    deleteManyMut.mutate({ ids: Array.from(selected) });
  }

  async function handleImport(
    rows: ImportRow[],
  ): Promise<ImportResult | undefined> {
    const coerced = rows.map((r) => {
      const status: 0 | 1 | undefined =
        r.status === "0" ? 0 : r.status === "1" ? 1 : undefined;
      return {
        name: r.name ?? "",
        ...(r.alias ? { alias: r.alias } : {}),
        ...(r.regionId ? { regionId: r.regionId } : {}),
        ...(status !== undefined ? { status } : {}),
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

  const editingFormInitial = useMemo<VillageDetail | null>(() => {
    if (!editingId) return null;
    if (!editingData) return null;
    return {
      id: editingData.id,
      name: editingData.name,
      alias: editingData.alias,
      regionId: editingData.regionId,
      status: editingData.status,
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

  const detail = useMemo<VillageDetail | null>(() => {
    if (!detailData) return null;
    return {
      id: detailData.id,
      name: detailData.name,
      alias: detailData.alias,
      regionId: detailData.regionId,
      status: detailData.status,
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
        title="村管理"
        description="维护自然村与行政村基础信息"
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            新建村
          </Button>
        }
      />

      <Reveal>
        <VillageStats stats={stats} />
      </Reveal>

      <Reveal delay={60}>
        <VillageToolbar
          regions={regionOptions}
          selectedCount={selected.size}
          onCreate={openCreate}
          onImport={() => setImportOpen(true)}
          onBatchDelete={handleBatchDelete}
        />
      </Reveal>

      <Reveal delay={120}>
        <VillageTable
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

      <CsvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="导入村"
        description="支持 CSV(header: name,alias,regionId,status)或 JSON 数组。"
        fields={[
          { key: "name", label: "名称", required: true },
          { key: "alias", label: "别名" },
          { key: "regionId", label: "区划 ID" },
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
              {`确定删除选中的 ${selected.size} 个村?此操作不可恢复。`}
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