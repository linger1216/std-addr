"use client";

import {
  Building2,
  ChevronDown,
  ChevronRight,
  Home,
  Landmark,
  MapPin,
  Plus,
  Trees,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import type { RouterOutputs } from "@/trpc/react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/layout/empty-state";
import { regionNodeIcon, type RegionNodeIconKey } from "./region-tree-utils";

/** 树数据 = region.list 输出(单一事实来源) */
export type RegionTreeNode = RouterOutputs["region"]["list"][number];

/** 节点分类 → 树形前图标:街道/镇乡/村委/居委各有不同 icon */
const NODE_ICONS: Record<RegionNodeIconKey, LucideIcon> = {
  street: Landmark, // 街道:行政地标
  town: Building2, // 镇/乡:乡镇楼宇
  village: Trees, // 村委会:绿意乡村
  committee: Home, // 居委:居民之家
  other: MapPin, // 兜底
};

/**
 * 行政区划左侧树:
 * - 点击行 → 选中(右侧面板编辑)
 * - 悬停操作:[+] 添加子节点、[🗑] 删除整棵子树
 * - 展开/收起由 store 的 expandedCodes 控制(按 code,跨刷新稳定)
 * - 搜索过滤时(forceExpanded)整棵树强制展开,只展示命中的节点与祖先链
 *   (过滤等树工具见 region-tree-utils.ts,页面传入已过滤的 nodes)
 */
export function RegionTree({
  nodes,
  selectedId,
  expandedCodes,
  forceExpanded = false,
  emptyState,
  onSelect,
  onToggleExpand,
  onAddChild,
  onDelete,
}: {
  nodes: RegionTreeNode[];
  selectedId: string | null;
  expandedCodes: Set<string>;
  /** 搜索过滤态:忽略手动的展开/收起,全链路展示 */
  forceExpanded?: boolean;
  /** 空态自定义文案(搜索无结果时传) */
  emptyState?: { title: string; description: string };
  onSelect: (id: string) => void;
  onToggleExpand: (code: string) => void;
  onAddChild: (node: RegionTreeNode) => void;
  onDelete: (node: RegionTreeNode) => void;
}) {
  if (nodes.length === 0) {
    return (
      <EmptyState
        title={emptyState?.title ?? "暂无区划数据"}
        description={
          emptyState?.description ??
          "点击右上角「导入 region.json」或「新建顶级节点」开始维护"
        }
      />
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      {nodes.map((node) => (
        <TreeNode
          key={node.code}
          node={node}
          depth={0}
          selectedId={selectedId}
          expandedCodes={expandedCodes}
          forceExpanded={forceExpanded}
          onSelect={onSelect}
          onToggleExpand={onToggleExpand}
          onAddChild={onAddChild}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

function TreeNode({
  node,
  depth,
  selectedId,
  expandedCodes,
  forceExpanded,
  onSelect,
  onToggleExpand,
  onAddChild,
  onDelete,
}: {
  node: RegionTreeNode;
  depth: number;
  selectedId: string | null;
  expandedCodes: Set<string>;
  forceExpanded: boolean;
  onSelect: (id: string) => void;
  onToggleExpand: (code: string) => void;
  onAddChild: (node: RegionTreeNode) => void;
  onDelete: (node: RegionTreeNode) => void;
}) {
  const hasChildren = node.children.length > 0;
  // 搜索过滤态:强制视为展开,chevron 也显示展开态,避免误导
  const isOpen = expandedCodes.has(node.code) || forceExpanded;
  const isSelected = selectedId === node.id;
  const NodeIcon = NODE_ICONS[regionNodeIcon(node.name)];

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-lg py-1 pr-1 transition-colors duration-150",
          isSelected ? "bg-primary/10" : "hover:bg-muted/60",
        )}
        style={{ paddingLeft: `${4 + depth * 16}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={isOpen ? "收起" : "展开"}
            title={isOpen ? "收起" : "展开"}
            onClick={() => onToggleExpand(node.code)}
            className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {isOpen ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
          </button>
        ) : (
          <span className="size-5 shrink-0" />
        )}

        <button
          type="button"
          onClick={() => onSelect(node.id)}
          className={cn(
            "flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 text-left text-[13px] transition-colors",
            isSelected
              ? "font-medium text-primary"
              : "text-foreground hover:text-primary",
          )}
        >
          <NodeIcon
            className={cn(
              "size-3.5 shrink-0",
              isSelected ? "text-primary" : "text-muted-foreground",
            )}
          />
          <span className="truncate">{node.name}</span>
          {hasChildren && (
            <Badge
              variant="outline"
              className="ml-auto shrink-0 px-1.5 py-0 text-[10px] font-normal text-muted-foreground"
            >
              {node.children.length}
            </Badge>
          )}
        </button>

        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
          <TreeAction
            title="添加子节点"
            aria-label={`给「${node.name}」添加子节点`}
            onClick={() => onAddChild(node)}
          >
            <Plus className="size-3.5" />
          </TreeAction>
          <TreeAction
            title="删除该节点及其子节点"
            aria-label={`删除「${node.name}」`}
            danger
            onClick={() => onDelete(node)}
          >
            <Trash2 className="size-3.5" />
          </TreeAction>
        </div>
      </div>

      {hasChildren && isOpen && (
        <div className="flex flex-col gap-0.5">
          {node.children.map((child) => (
            <TreeNode
              key={child.code}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              expandedCodes={expandedCodes}
              forceExpanded={forceExpanded}
              onSelect={onSelect}
              onToggleExpand={onToggleExpand}
              onAddChild={onAddChild}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TreeAction({
  title,
  danger,
  children,
  onClick,
}: {
  title: string;
  danger?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors",
        danger
          ? "hover:bg-danger-soft hover:text-danger"
          : "hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
