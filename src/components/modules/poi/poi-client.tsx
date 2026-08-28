"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import {
  ExcelImportDialog,
  type ImportResult,
  type ImportRow,
} from "@/components/modules/shared/excel-import";
import { PaginationControl } from "@/components/modules/shared/pagination-control";
import {
  PoiFormDialog,
  type PoiDetail,
  type PoiFormValues,
} from "@/components/modules/poi/poi-form";
import { PoiDetailDialog } from "@/components/modules/poi/poi-detail";
import { PoiStats } from "@/components/modules/poi/poi-stats";
import { PoiTable, type PoiRow } from "@/components/modules/poi/poi-table";
import {
  type RegionOption,
  PoiToolbar,
} from "@/components/modules/poi/poi-toolbar";
import { usePoiQueryParams } from "@/components/modules/poi/use-poi-query-params";
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
  type: string | null;
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

export function PoiClient() {
  // 分页 + 筛选
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // ponytail: 查询参数 state 由 usePoiQueryParams(zustand) 管理
  const committed = usePoiQueryParams((s) => s.committed);

  // 选中
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // 表单 dialog
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // 详情 dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  // 删除 confirm
  const [deleteRow, setDeleteRow] = useState<PoiRow | null>(null);
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
      type: committed.type || undefined,
      regionId: committed.regionId || undefined,
      status: committed.status === "" ? undefined : (Number(committed.status) as 0 | 1),
    }),
    [page, pageSize, committed],
  );

  const { data: listData, isLoading: listLoading } =
    api.poi.list.useQuery(listInput);
  const { data: stats } = api.poi.stats.useQuery();
  const { data: regions } = api.poi.regions.useQuery();
  const { data: detailData } = api.poi.getById.useQuery(
    { id: detailId ?? "" },
    { enabled: Boolean(detailId) },
  );
  const { data: editingData } = api.poi.getById.useQuery(
    { id: editingId ?? "" },
    { enabled: Boolean(editingId) },
  );

  const regionOptions: RegionOption[] = useMemo(
    () => (regions ?? []).map((r) => ({ id: r.id, name: r.name })),
    [regions],
  );

  // Mutations
  const createMut = api.poi.create.useMutation({
    onSuccess: async () => {
      await Promise.all([
        rpc.poi.list.invalidate(),
        rpc.poi.stats.invalidate(),
      ]);
      toast.success("POI 已创建");
      setFormOpen(false);
      setEditingId(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = api.poi.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        rpc.poi.list.invalidate(),
        rpc.poi.stats.invalidate(),
      ]);
      toast.success("POI 已更新");
      setFormOpen(false);
      setEditingId(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = api.poi.delete.useMutation({
    onSuccess: async () => {
      await Promise.all([
        rpc.poi.list.invalidate(),
        rpc.poi.stats.invalidate(),
      ]);
      toast.success("已删除");
      setDeleteRow(null);
      setSelected(new Set());
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteManyMut = api.poi.deleteMany.useMutation({
    onSuccess: async (res) => {
      await Promise.all([
        rpc.poi.list.invalidate(),
        rpc.poi.stats.invalidate(),
      ]);
      toast.success(`已删除 ${res.count} 条`);
      setBatchDeleteOpen(false);
      setSelected(new Set());
    },
    onError: (e) => toast.error(e.message),
  });
  const importMut = api.poi.import.useMutation({
    onSuccess: async () => {
      await Promise.all([
        rpc.poi.list.invalidate(),
        rpc.poi.stats.invalidate(),
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

  const rows: PoiRow[] = useMemo(
    () =>
      (listData?.items ?? []).map((item: ListItem) => ({
        id: item.id,
        name: item.name,
        type: item.type,
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
  function openEdit(row: PoiRow) {
    setEditingId(row.id);
  }

  function openView(row: PoiRow) {
    setDetailId(row.id);
    setDetailOpen(true);
  }

  function handleSubmit(values: PoiFormValues) {
    let address: unknown;
    try {
      address = parseOptionalJson("address", values.address);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      return;
    }

    const addr = (address ?? null) as never;
    // geom: 后端 DDL 是 GEOMCOLLECTION,Prisma 暂不支持;不传

    if (values.id) {
      updateMut.mutate({
        id: values.id,
        name: values.name,
        type: values.type || undefined,
        alias: values.alias || undefined,
        regionId: values.regionId || undefined,
        status: values.status,
        address: addr,
      });
    } else {
      createMut.mutate({
        name: values.name,
        type: values.type || undefined,
        alias: values.alias || undefined,
        regionId: values.regionId || undefined,
        status: values.status,
        address: addr,
      });
    }
  }

  function handleDelete(row: PoiRow) {
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
        ...(r.type ? { type: r.type } : {}),
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
  /** 导出当前筛选条件下的全部 POI 到 .xlsx */
  async function handleExport() {
    try {
      const items = await rpc.poi.exportAll.fetch({
        q: committed.q || undefined,
        regionId: committed.regionId || undefined,
        status:
          committed.status === ""
            ? undefined
            : (Number(committed.status) as 0 | 1),
      });

      const rows = items.map((it) => ({
        "名称": it.name,
        "类型": it.type ?? "",
        "别名": it.alias ?? "",
        "所属区划ID": it.regionId ?? "",
        "状态": it.status === 1 ? 1 : 0,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [{ wch: 24 }, { wch: 16 }, { wch: 20 }, { wch: 28 }, { wch: 12 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "POI");
      XLSX.writeFile(wb, `POI_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success(`已导出 ${rows.length} 条`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  const editingFormInitial = useMemo<PoiDetail | null>(() => {
    if (!editingId) return null;
    if (!editingData) return null;
    return {
      id: editingData.id,
      name: editingData.name,
      type: editingData.type,
      alias: editingData.alias,
      regionId: editingData.regionId,
      status: editingData.status,
      address: editingData.address,
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

  const detail = useMemo<PoiDetail | null>(() => {
    if (!detailData) return null;
    return {
      id: detailData.id,
      name: detailData.name,
      type: detailData.type,
      alias: detailData.alias,
      regionId: detailData.regionId,
      status: detailData.status,
      address: detailData.address,
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
        title="POI 管理"
        description="维护 POI 名称、分类与坐标"
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            新建 POI
          </Button>
        }
      />

      <Reveal>
        <PoiStats stats={stats} />
      </Reveal>

      <Reveal delay={60}>
        <PoiToolbar
          regions={regionOptions}
          selectedCount={selected.size}
          onCreate={openCreate}
          onImport={() => setImportOpen(true)}
          onExport={handleExport}
          onBatchDelete={handleBatchDelete}
        />
      </Reveal>

      <Reveal delay={120}>
        <PoiTable
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

      <PoiFormDialog
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

      <PoiDetailDialog
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
        title="导入 POI"
        description="仅支持 Excel(.xlsx/.xls)。可先下载模板填写后导入。"
        fields={[
          { key: "name", label: "名称", required: true, width: 24 },
          { key: "type", label: "类型", width: 16 },
          { key: "alias", label: "别名", width: 20 },
          { key: "regionId", label: "区划 ID", width: 28 },
          { key: "status", label: "状态", width: 12 },
        ]}
        onSubmit={handleImport}
        isPending={importMut.isPending}
        fileNamePrefix="POI导入模板"
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
            <DialogTitle>删除 POI</DialogTitle>
            <DialogDescription>
              {`确定删除 POI「${deleteRow?.name ?? ""}」?此操作不可恢复。`}
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
              {`确定删除选中的 ${selected.size} 个 POI?此操作不可恢复。`}
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