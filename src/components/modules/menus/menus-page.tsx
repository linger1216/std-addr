"use client";

import { useMemo } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

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

import { MenusTree } from "./menus-tree";
import {
  MenusDetailForm,
  type MenuDetailRecord,
  type MenuDetailSubmit,
} from "./menus-detail-form";
import { useMenusActions, useMenusState } from "./stores/menus-store";

import { api } from "@/trpc/react";

/**
 * 菜单管理页 —— 左侧树(master)+ 右侧内联表单(detail)布局。
 *
 * 数据流:
 *  - listAll 一次拉全量 → 左侧树(树形递进 + 同级拖拽 + 折叠/搜索)
 *  - 点击节点 → store.selectedId → 右侧表单直接编辑(数据已在手,无需 getById)
 *  - 顶部「新建菜单」/ 节点「+」→ store.createActive → 右侧切新建表单
 *
 * mutation 说明:
 *   create/update/delete/reorder 独立注册,不复用 useCrudMutations ——
 *   create 需要拿到返回的新 id 以「选中新节点并展开父级」,套件不暴露 mutation 返回值。
 *   其余行为(失效/成功语/toast)与套件对齐。
 */

export function MenusPage() {
  const state = useMenusState();
  const actions = useMenusActions();

  const utils = api.useUtils();

  const { data: menus, isLoading } = api.menu.listAll.useQuery();

  const createMut = api.menu.create.useMutation({
    onSuccess: async (data) => {
      await utils.menu.listAll.invalidate();
      toast.success("菜单已创建");
      // 新节点自动选中,并展开其父级(若父级被折叠)
      actions.select(data.id);
      if (data.parentId) actions.setCollapsed(data.parentId, false);
      actions.cancelCreate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = api.menu.update.useMutation({
    onSuccess: async () => {
      await utils.menu.listAll.invalidate();
      toast.success("菜单已更新");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = api.menu.delete.useMutation({
    onSuccess: async () => {
      await utils.menu.listAll.invalidate();
      toast.success("菜单已删除");
      // 删除的是当前选中/新建目标时,回到空态
      if (state.selectedId === state.deleteRow?.id) actions.select(null);
      if (state.createParentId === state.deleteRow?.id) actions.cancelCreate();
      actions.cancelDelete();
    },
    onError: (e) => toast.error(e.message),
  });

  const reorderMut = api.menu.reorder.useMutation({
    onSuccess: async () => {
      await utils.menu.listAll.invalidate();
      toast.success("顺序已更新");
    },
    onError: (e) => toast.error(e.message),
  });

  // 选中节点记录(直接复用 listAll 数据,无需额外请求)
  const recordById = useMemo(() => {
    const m = new Map<string, MenuDetailRecord>();
    for (const r of menus ?? []) m.set(r.id, r);
    return m;
  }, [menus]);

  const selectedRecord = state.selectedId
    ? (recordById.get(state.selectedId) ?? null)
    : null;

  // 父菜单选项:排除「编辑对象自身」或「新建目标的自身」子树,防循环引用
  const parentOptions = useMemo(() => {
    if (!menus) return [];
    const excludeRoot = state.createActive
      ? state.createParentId
      : state.selectedId;
    const exclude = new Set<string>();
    if (excludeRoot) {
      exclude.add(excludeRoot);
      const queue = [excludeRoot];
      while (queue.length) {
        const head = queue.shift()!;
        for (const m of menus) {
          if (m.parentId === head) {
            exclude.add(m.id);
            queue.push(m.id);
          }
        }
      }
    }
    const byParent = new Map<string | null, MenuDetailRecord[]>();
    for (const m of menus) {
      if (exclude.has(m.id)) continue;
      const k = m.parentId ?? null;
      const list = byParent.get(k) ?? [];
      list.push(m);
      byParent.set(k, list);
    }
    for (const [, list] of byParent) {
      list.sort((a, b) => a.sort - b.sort);
    }
    const out: { id: string; name: string; depth: number }[] = [];
    const walk = (pid: string | null, depth: number) => {
      for (const m of byParent.get(pid) ?? []) {
        out.push({ id: m.id, name: m.name, depth });
        walk(m.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [menus, state.selectedId, state.createActive, state.createParentId]);

  function handleSubmit(values: MenuDetailSubmit) {
    const parentId = values.parentId ?? null;
    if (state.createActive) {
      createMut.mutate({
        name: values.name,
        path: values.path,
        icon: values.icon,
        sort: values.sort,
        visible: values.visible,
        parentId,
      });
    } else if (values.id) {
      updateMut.mutate({
        id: values.id,
        name: values.name,
        path: values.path,
        icon: values.icon,
        sort: values.sort,
        visible: values.visible,
        parentId,
      });
    }
  }

  function handleDelete() {
    if (!state.deleteRow) return;
    deleteMut.mutate({ id: state.deleteRow.id });
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        title="菜单管理"
        description="左侧树形结构维护层级,右侧编辑菜单详情;同级节点可拖拽排序"
        actions={
          <MotionButton onClick={() => actions.startCreate(null)}>
            <Plus className="size-4" />
            新建菜单
          </MotionButton>
        }
      />

      <Reveal className="min-h-0 flex-1">
        <div className="flex h-full min-h-0 overflow-hidden rounded-xl border bg-card">
          {/* 左:树 */}
          <aside className="flex w-80 shrink-0 flex-col border-r p-3">
            <MenusTree
              rows={menus ?? []}
              selectedId={state.selectedId}
              collapsedIds={state.collapsedIds}
              onSelect={actions.select}
              onToggleCollapsed={actions.toggleCollapsed}
              onStartCreate={actions.startCreate}
              onReorder={(parentId, orderedIds) =>
                reorderMut.mutate({ parentId, orderedIds })
              }
            />
          </aside>

          {/* 右:详情/新建表单 */}
          <section className="min-w-0 flex-1 p-4">
            {isLoading && !menus ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                加载中…
              </div>
            ) : (
              <MenusDetailForm
                record={
                  state.createActive ? null : selectedRecord
                }
                createMode={state.createActive}
                createParentId={state.createParentId}
                parentOptions={parentOptions}
                isSaving={createMut.isPending || updateMut.isPending}
                onCreate={handleSubmit}
                onUpdate={handleSubmit}
                onDelete={() =>
                  selectedRecord &&
                  actions.requestDelete({
                    id: selectedRecord.id,
                    name: selectedRecord.name,
                  })
                }
                onCancelCreate={() => {
                  actions.cancelCreate();
                  if (!state.selectedId) actions.select(null);
                }}
              />
            )}
          </section>
        </div>
      </Reveal>

      {/* 删除确认 */}
      <Dialog
        open={Boolean(state.deleteRow)}
        onOpenChange={(v) => {
          if (!v) actions.cancelDelete();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除菜单</DialogTitle>
            <DialogDescription>
              {`确定删除菜单「${state.deleteRow?.name ?? ""}」及其全部子菜单?此操作不可恢复。`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={actions.cancelDelete}>
              取消
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deleteMut.isPending}
              className="bg-danger text-white hover:bg-danger/90"
            >
              {deleteMut.isPending ? "删除中…" : "删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}