"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ChevronsDownUp,
  ChevronsUpDown,
  MapPin,
  Plus,
  Search,
  TreePine,
  Upload,
  X,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Button, MotionButton } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Reveal } from "@/components/ui/reveal";
import { Input } from "@/components/ui/input";
import {
  RegionTree,
  type RegionTreeNode,
} from "./region-tree";
import {
  allExpandableCodes,
  collectPathCodes,
  countNodes,
  filterRegionTree,
  findNodeByCode,
  findNodeById,
} from "./region-tree-utils";
import {
  RegionEditPanel,
  RegionFormDialog,
  type ParentOption,
} from "./region-form";
import {
  flattenParentOptions,
  type RegionFormValues,
} from "./region-form-mappers";
import { RegionJsonImportDialog } from "./region-json-import";
import { useRegionState, useRegionActions } from "./stores/region-store";
import { useCrudMutations } from "@/lib/crud/use-crud-mutations";
import { toApiError } from "@/lib/api/error";

import { api } from "@/trpc/react";

/**
 * 行政区划页顶层编排 —— 左侧树 + 右侧编辑面板。
 *
 * 数据流:
 *   api.region.list(全量树,React Query)→ RegionTree(左)
 *     点击节点 → store.selectedId → RegionEditPanel(右,可编辑)
 *   新建/编辑/删除走 useCrudMutations(自动 invalidate region.list/stats)
 *   导入走 region.import(覆盖合并,完成后定位首个节点)
 */
export function RegionPage() {
  const state = useRegionState();
  const actions = useRegionActions();
  const utils = api.useUtils();

  // —— 树搜索关键词(仅本地 UI 态)——
  const [query, setQuery] = useState("");

  // —— 查询 ——
  const { data: treeData, isLoading } = api.region.list.useQuery();
  const { data: stats } = api.region.stats.useQuery();

  // —— mutation 套件(tree 模块无分页,list 即全量树)——
  const mut = useCrudMutations({
    utils,
    invalidateKeys: ["region"],
    procedures: {
      create: api.region.create,
      update: api.region.update,
      delete: api.region.delete,
      deleteMany: api.region.deleteMany,
    },
    messages: {
      createSuccess: "区划节点已创建",
      updateSuccess: "区划节点已更新",
      deleteSuccess: "已删除区划及其子节点",
      deleteManySuccess: (n) => `已删除 ${n} 个节点`,
    },
    hooks: {
      onAfterCreate: () => actions.closeCreate(),
      onAfterUpdate: () => undefined,
      onAfterDelete: () => actions.cancelDelete(),
      onAfterDeleteMany: () => actions.cancelDelete(),
    },
  });

  // —— 覆盖导入(独立 mutation,返回统计)——
  const importMut = api.region.import.useMutation({
    onSuccess: async (res) => {
      toast.success(
        `导入完成:共 ${res.total} 个节点(新增 ${res.created}、更新 ${res.updated}、删除 ${res.deleted})`,
      );
      actions.closeImport();
      // 覆盖后树大变,收起全部并定位到首个节点
      actions.collapseAll();
      actions.setPendingSelect(res.firstCode ?? null);
      await Promise.all([
        utils.region.list.invalidate(),
        utils.region.stats.invalidate(),
      ]);
    },
    onError: (e) => toast.error(toApiError(e).message),
  });

  const tree: RegionTreeNode[] = treeData ?? [];

  // —— 选中节点(树刷新后可能失效,自动清空)——
  const selectedNode = useMemo(
    () => (state.selectedId ? findNodeById(tree, state.selectedId) : null),
    [tree, state.selectedId],
  );
  useEffect(() => {
    if (state.selectedId && !selectedNode) actions.selectNode(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNode]);

  // —— 新建成功后定位:等树刷新,找到 code → 选中并展开祖先链 ——
  useEffect(() => {
    if (!state.pendingSelectCode || tree.length === 0) return;
    const target = findNodeByCode(tree, state.pendingSelectCode);
    if (!target) return;
    actions.selectNode(target.id);
    actions.ensureExpanded(collectPathCodes(tree, target.code) ?? []);
    actions.setPendingSelect(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, state.pendingSelectCode]);

  // —— 表单提交 ——
  function handleCreate(values: RegionFormValues) {
    actions.setPendingSelect(values.code);
    mut.create.mutate({
      name: values.name,
      code: values.code,
      type: values.type ?? null,
      alias: values.alias || null,
      parentCode: values.parentCode ?? "",
      sortOrder: values.sortOrder,
      status: values.status,
    });
  }

  function handleUpdate(node: RegionTreeNode, values: RegionFormValues) {
    mut.update.mutate({
      id: node.id,
      name: values.name,
      code: values.code,
      type: values.type ?? null,
      alias: values.alias || null,
      parentCode: values.parentCode ?? "",
      sortOrder: values.sortOrder,
      status: values.status,
    });
  }

  // —— 上级下拉 ——
  // 编辑:排除自身与后代(防环挂载)
  const editParentOptions: ParentOption[] = useMemo(
    () => flattenParentOptions(tree, selectedNode?.code),
    [tree, selectedNode],
  );
  // 新建:全量可挂(节点还不存在);预设父级必须能在选项里命中,否则下拉显示不出填充值
  const createParentOptions: ParentOption[] = useMemo(
    () => flattenParentOptions(tree),
    [tree],
  );

  // —— 树搜索过滤:命中节点 + 祖先链保留,其余剪掉 ——
  const isFiltering = query.trim() !== "";
  const filteredTree = useMemo(
    () => filterRegionTree(tree, query),
    [tree, query],
  );
  const filteredCount = useMemo(
    () => (isFiltering ? countNodes(filteredTree) : null),
    [isFiltering, filteredTree],
  );

  // —— 展开/收起 ——
  const allExpandableCodesMemo = useMemo(() => allExpandableCodes(tree), [tree]);

  function confirmDelete() {
    if (state.deleteRow) mut.remove.mutate({ id: state.deleteRow.id });
  }

  const formPending = mut.create.isPending || mut.update.isPending;

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <PageHeader
        title="行政区划"
        description="维护行政区划树(regions),支持节点增删改与 region.json 覆盖导入"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={actions.openImport}>
              <Upload className="size-3.5" />
              导入 region.json
            </Button>
            <MotionButton size="sm" onClick={() => actions.openCreate(null)}>
              <Plus className="size-3.5" />
              新建顶级节点
            </MotionButton>
          </>
        }
      />

      <Reveal className="min-h-0 flex-1">
        <div className="flex h-full min-h-0 gap-4">
          {/* ── 左:区划树 ── */}
          <div className="flex w-75 shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-4 py-3">
              <TreePine className="size-4 text-muted-foreground" />
              <span className="text-[13px] font-medium">区划树</span>
              <span className="text-[11.5px] text-muted-foreground">
                {isFiltering
                  ? `匹配 ${filteredCount ?? 0} 个节点`
                  : stats
                    ? `共 ${stats.total} 个节点`
                    : ""}
              </span>
              <div className="ml-auto flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="全部展开"
                  onClick={() => actions.expandAll(allExpandableCodesMemo)}
                >
                  <ChevronsUpDown className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="全部收起"
                  onClick={actions.collapseAll}
                >
                  <ChevronsDownUp className="size-3.5" />
                </Button>
              </div>
            </div>

            {/* 树搜索:过滤视图强制展开,展示命中节点与祖先链 */}
            <div className="relative shrink-0 border-b border-border px-2.5 py-2">
              <Search className="pointer-events-none absolute top-1/2 left-4.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索名称 / 编码"
                className="h-8 border-transparent bg-muted/50 pl-8 pr-7 text-[13px]"
              />
              {query && (
                <button
                  type="button"
                  aria-label="清空搜索"
                  title="清空搜索"
                  onClick={() => setQuery("")}
                  className="absolute top-1/2 right-3 flex size-4 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {isLoading ? (
                <p className="px-3 py-8 text-center text-[12.5px] text-muted-foreground">
                  加载中…
                </p>
              ) : (
                <RegionTree
                  nodes={filteredTree}
                  selectedId={state.selectedId}
                  expandedCodes={state.expandedCodes}
                  forceExpanded={isFiltering}
                  emptyState={
                    isFiltering
                      ? {
                          title: "没有匹配的区划节点",
                          description: "换个关键词试试,或清空搜索",
                        }
                      : undefined
                  }
                  onSelect={actions.selectNode}
                  onToggleExpand={actions.toggleExpand}
                  onAddChild={(node) => actions.openCreate(node.code)}
                  onDelete={(node) =>
                    actions.requestDelete({
                      id: node.id,
                      name: node.name,
                      subtreeCount: countNodes([node]),
                    })
                  }
                />
              )}
            </div>
          </div>

          {/* ── 右:详情 + 编辑 ── */}
          <div className="min-w-0 flex-1">
            {selectedNode ? (
              <RegionEditPanel
                node={selectedNode}
                parentOptions={editParentOptions}
                isPending={mut.update.isPending}
                onSaved={(values) => handleUpdate(selectedNode, values)}
                onAddChild={() => actions.openCreate(selectedNode.code)}
                onDelete={() =>
                  actions.requestDelete({
                    id: selectedNode.id,
                    name: selectedNode.name,
                    subtreeCount: countNodes([selectedNode]),
                  })
                }
              />
            ) : (
              <EmptyState
                icon={<MapPin className="size-5" />}
                title="请选择区划节点"
                description="在左侧树中选择一个节点,右侧将展示其详情并支持编辑;也可以在左上角导入 region.json 或新建顶级节点。"
                actions={
                  <Button size="sm" onClick={() => actions.openCreate(null)}>
                    <Plus className="size-3.5" />
                    新建顶级节点
                  </Button>
                }
                className="h-full"
              />
            )}
          </div>
        </div>
      </Reveal>

      {/* 新建节点 dialog */}
      <RegionFormDialog
        open={state.createOpen}
        onOpenChange={(v) => {
          if (!v) actions.closeCreate();
        }}
        presetParentCode={state.createParentCode}
        parentOptions={createParentOptions}
        isPending={formPending}
        onSubmit={handleCreate}
      />

      {/* 导入 dialog */}
      <RegionJsonImportDialog
        open={state.importOpen}
        onOpenChange={(v) => {
          if (!v) actions.closeImport();
        }}
        currentCount={stats?.total ?? 0}
        isPending={importMut.isPending}
        onImport={(data) =>
          importMut.mutate({ data })
        }
      />

      {/* 删除确认 */}
      <Dialog
        open={Boolean(state.deleteRow)}
        onOpenChange={(v) => {
          if (!v) actions.cancelDelete();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除区划节点</DialogTitle>
            <DialogDescription>
              {`确定删除「${state.deleteRow?.name ?? ""}」及其全部子节点`
                + `(${state.deleteRow?.subtreeCount ?? 0} 个)?`
                + "关联到这些区划的小区 / 村 / 兴趣点的区划将置空,此操作不可恢复。"}
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
    </div>
  );
}
