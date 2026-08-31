"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, GripVertical, Plus, Search, X } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "motion/react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { RouterOutputs } from "@/trpc/react";
import { LucideIcon } from "./use-lucide-icons";

/** 树节点 = listAll 记录 + 嵌套 children */
export type MenuTreeNode = RouterOutputs["menu"]["listAll"][number] & {
  children: MenuTreeNode[];
};

function buildTree(rows: RouterOutputs["menu"]["listAll"]): MenuTreeNode[] {
  const byParent = new Map<string | null, MenuTreeNode[]>();
  for (const r of rows) {
    const k = r.parentId ?? null;
    const list = byParent.get(k) ?? [];
    list.push({ ...r, children: [] });
    byParent.set(k, list);
  }
  for (const [, list] of byParent) {
    list.sort((a, b) => {
      if (a.sort !== b.sort) return a.sort - b.sort;
      return a.name.localeCompare(b.name);
    });
  }
  const walk = (pid: string | null): MenuTreeNode[] =>
    (byParent.get(pid) ?? []).map((n) => {
      n.children = walk(n.id);
      return n;
    });
  return walk(null);
}

/** 搜索过滤:保留自身匹配或子树匹配的节点(路径不断) */
function filterTree(nodes: MenuTreeNode[], q: string): MenuTreeNode[] {
  const ql = q.trim().toLowerCase();
  if (!ql) return nodes;
  const out: MenuTreeNode[] = [];
  for (const n of nodes) {
    const children = filterTree(n.children, ql);
    if (n.name.toLowerCase().includes(ql) || children.length > 0) {
      out.push({ ...n, children });
    }
  }
  return out;
}

/** 在(过滤后的)树中按父 id 找直接子节点列表;找不到返回 null */
function findChildren(
  nodes: MenuTreeNode[],
  pid: string | null,
): MenuTreeNode[] | null {
  if (pid === null) return nodes.length > 0 ? nodes : null;
  for (const n of nodes) {
    if (n.id === pid) return n.children.length > 0 ? n.children : null;
    const sub = findChildren(n.children, pid);
    if (sub) return sub;
  }
  return null;
}

export function MenusTree({
  rows,
  selectedId,
  collapsedIds,
  onSelect,
  onToggleCollapsed,
  onStartCreate,
  onReorder,
}: {
  rows: RouterOutputs["menu"]["listAll"];
  selectedId: string | null;
  collapsedIds: string[];
  onSelect: (id: string | null) => void;
  onToggleCollapsed: (id: string) => void;
  onStartCreate: (parentId: string | null) => void;
  onReorder: (parentId: string | null, orderedIds: string[]) => void;
}) {
  const [query, setQuery] = React.useState("");

  const tree = React.useMemo(() => buildTree(rows), [rows]);
  const filtered = React.useMemo(() => filterTree(tree, query), [tree, query]);
  /** 搜索中强制展开全部(折叠态忽略,保证命中可见) */
  const isSearching = query.trim().length > 0;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  /** 拖动中的 active 属于哪一层:按 id → parentId 索引 */
  const parentOf = React.useMemo(() => {
    const m = new Map<string, string | null>();
    for (const r of rows) m.set(r.id, r.parentId ?? null);
    return m;
  }, [rows]);

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const pid = parentOf.get(String(active.id));
    if (pid === undefined) return;
    const siblings = findChildren(filtered, pid);
    if (!siblings) return;
    const ids = siblings.map((n) => n.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(pid, arrayMove(ids, oldIndex, newIndex));
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 搜索框(固定区) */}
      <div className="shrink-0 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索菜单"
            className="h-8 border-transparent bg-muted/50 pl-8 pr-7 text-[13px]"
          />
          <AnimatePresence>
            {query && (
              <motion.button
                type="button"
                aria-label="清空搜索"
                onClick={() => setQuery("")}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="absolute top-1/2 right-2 flex size-4 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="size-3" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* 树(滚动区) */}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {rows.length === 0
              ? "暂无菜单,点击右上角「新建菜单」开始"
              : "无匹配菜单"}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <TreeLevel
              nodes={filtered}
              selectedId={selectedId}
              collapsedIds={collapsedIds}
              isSearching={isSearching}
              onSelect={onSelect}
              onToggleCollapsed={onToggleCollapsed}
              onStartCreate={onStartCreate}
            />
          </DndContext>
        )}
      </div>
    </div>
  );
}

/** 一层节点:SortableContext + 递归子层 */
function TreeLevel({
  nodes,
  selectedId,
  collapsedIds,
  isSearching,
  onSelect,
  onToggleCollapsed,
  onStartCreate,
}: {
  nodes: MenuTreeNode[];
  selectedId: string | null;
  collapsedIds: string[];
  isSearching: boolean;
  onSelect: (id: string | null) => void;
  onToggleCollapsed: (id: string) => void;
  onStartCreate: (parentId: string | null) => void;
}) {
  return (
    <SortableContext
      items={nodes.map((n) => n.id)}
      strategy={verticalListSortingStrategy}
    >
      <div className="space-y-0.5">
        {nodes.map((node) => {
          const collapsed = collapsedIds.includes(node.id);
          const hasChildren = node.children.length > 0;
          const showChildren = hasChildren && (isSearching || !collapsed);
          return (
            <div key={node.id} className="group">
              <TreeNodeRow
                node={node}
                selected={node.id === selectedId}
                hasChildren={hasChildren}
                collapsed={collapsed}
                onSelect={() => onSelect(node.id)}
                onToggle={() => onToggleCollapsed(node.id)}
                onCreateChild={() => onStartCreate(node.id)}
              />
              {showChildren && (
                <div className="ml-4 border-l border-border/60 pl-2">
                  <TreeLevel
                    nodes={node.children}
                    selectedId={selectedId}
                    collapsedIds={collapsedIds}
                    isSearching={isSearching}
                    onSelect={onSelect}
                    onToggleCollapsed={onToggleCollapsed}
                    onStartCreate={onStartCreate}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SortableContext>
  );
}

/** 单行:grip 拖拽手柄 + 折叠箭头 + 图标 + 名称 + hover 新建子菜单 */
function TreeNodeRow({
  node,
  selected,
  hasChildren,
  collapsed,
  onSelect,
  onToggle,
  onCreateChild,
}: {
  node: MenuTreeNode;
  selected: boolean;
  hasChildren: boolean;
  collapsed: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onCreateChild: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: node.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      onClick={onSelect}
      role="treeitem"
      aria-selected={selected}
      className={cn(
        "flex h-8 cursor-pointer items-center gap-1 rounded-lg px-1.5 text-sm transition-colors",
        selected
          ? "bg-primary/10 font-medium text-primary"
          : "text-foreground hover:bg-accent/60",
        isDragging && "shadow-md ring-1 ring-primary/40",
      )}
    >
      {/* grip:仅拖拽,不触发选中 */}
      <button
        type="button"
        aria-label={`拖动 ${node.name}`}
        title="拖动排序(仅同层)"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 cursor-grab rounded p-0.5 text-muted-foreground/50 hover:bg-accent hover:text-muted-foreground active:cursor-grabbing"
      >
        <GripVertical className="size-3.5" />
      </button>

      {/* 折叠箭头:有子级才显示 */}
      {hasChildren ? (
        <button
          type="button"
          aria-label={collapsed ? "展开" : "收起"}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {collapsed ? (
            <ChevronRight className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
        </button>
      ) : (
        <span className="w-[26px] shrink-0" aria-hidden />
      )}

      <LucideIcon name={node.icon} className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-left">{node.name}</span>
      {!node.visible && (
        <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">
          隐藏
        </span>
      )}

      {/* hover 新建子菜单 */}
      <button
        type="button"
        aria-label={`在 ${node.name} 下新建子菜单`}
        title="新建子菜单"
        onClick={(e) => {
          e.stopPropagation();
          onCreateChild();
        }}
        className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent hover:text-foreground"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}