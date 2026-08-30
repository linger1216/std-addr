"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BookMarked,
  BrainCircuit,
  Layers,
  Building2,
  ChevronDown,
  ChevronRight,
  Home,
  LayoutDashboard,
  Map,
  MapPin,
  Menu as MenuIcon,
  Settings,
  Shield,
  SlidersHorizontal,
  Trees,
  TreePine,
  Users,
  Waypoints,
  type LucideIcon,
} from "lucide-react";

import { type MenuNode } from "@/server/api/routers/menu";
import { cn } from "@/lib/utils";

const iconMap: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  settings: Settings,
  "sliders-horizontal": SlidersHorizontal,
  "brain-circuit": BrainCircuit,
  layers: Layers,
  users: Users,
  shield: Shield,
  menu: MenuIcon,
  map: Map,
  trees: Trees,
  "tree-pine": TreePine,
  "book-marked": BookMarked,
  home: Home,
  waypoints: Waypoints,
  "map-pin": MapPin,
  building: Building2,
};

export { type MenuNode };

export function Sidebar({
  menus,
  collapsed,
  onExpand,
}: {
  menus: MenuNode[];
  collapsed: boolean;
  onExpand: () => void;
}) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    menus.forEach((m) => {
      if (m.children.length > 0) s.add(m.id);
    });
    return s;
  });

  // 记录当前弹出的子菜单所属的 parent id
  const [popupParentId, setPopupParentId] = useState<string | null>(null);
  // popup 菜单位置（用于定位）
  const [popupPos, setPopupPos] = useState<{ top: number; height: number } | null>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭 popup
  useEffect(() => {
    if (!popupParentId) return;
    const handler = (e: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(e.target as Node) &&
        sidebarRef.current &&
        !sidebarRef.current.contains(e.target as Node)
      ) {
        setPopupParentId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [popupParentId]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 记录点击坐标并弹出子菜单面板
  const handleParentClick = (e: React.MouseEvent, node: MenuNode) => {
    if (!collapsed) {
      toggle(node.id);
    } else {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setPopupPos({ top: rect.top, height: rect.height });
      setPopupParentId(node.id);
    }
  };

  // 找到 popup 对应的父节点
  const popupParent = menus.find((m) => m.id === popupParentId) ?? null;

  return (
    <>
      <aside
        ref={sidebarRef}
        data-collapsed={collapsed}
        className={cn(
          "flex shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground",
          "sticky top-0 h-screen transition-[width] duration-200 ease-out",
          collapsed ? "w-14" : "w-[220px]"
        )}
      >
        {/* Logo */}
        <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-border px-4">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-xl bg-primary text-[13px] font-semibold text-primary-foreground">
            SA
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate font-heading text-[15px] font-semibold tracking-[-0.01em]">std-addr</div>
              <div className="truncate text-[11px] text-muted-foreground">管理控制台</div>
            </div>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {!collapsed && (
            <div className="px-3 pb-1 pt-3 text-[11px] font-medium tracking-[0.04em] uppercase text-muted-foreground">
              导航
            </div>
          )}
          {menus.map((m) => (
            <MenuLink
              key={m.id}
              node={m}
              pathname={pathname}
              collapsed={collapsed}
              depth={0}
              expanded={expanded}
              toggle={toggle}
              onExpand={onExpand}
              onParentClick={(e) => handleParentClick(e, m)}
            />
          ))}
        </nav>

        {!collapsed && (
          <div className="flex items-center gap-2.5 border-t border-border p-3">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[12px] font-medium text-foreground">
              管
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-medium">管理员</div>
              <div className="truncate text-[11px] text-muted-foreground">超级管理员</div>
            </div>
          </div>
        )}
      </aside>

      {/* 子菜单水平弹出面板（collapsed 态专用） */}
      {collapsed && popupParent && popupPos && (
        <div
          ref={popupRef}
          className="fixed z-50 flex flex-col gap-0.5 rounded-2xl border border-border bg-popover p-1.5 shadow-[0_8px_32px_rgba(0,0,0,.14)]"
          style={{
            top: popupPos.top,
            left: `calc(56px + 4px)`, // 侧边栏宽 56px + 4px 间距
            minWidth: "160px",
          }}
        >
          <div className="mb-1 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {popupParent.name}
          </div>
          {popupParent.children.map((child) => {
            const Icon = child.icon ? iconMap[child.icon] : undefined;
            const childActive =
              !!child.path &&
              (pathname === child.path || pathname.startsWith(child.path + "/"));
            return (
              <Link
                key={child.id}
                href={child.path ?? "#"}
                onClick={() => setPopupParentId(null)}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] transition-colors duration-150",
                  childActive
                    ? "bg-muted/60 font-medium text-primary"
                    : "text-foreground hover:bg-muted/50"
                )}
              >
                {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
                <span>{child.name}</span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

function MenuLink({
  node,
  pathname,
  collapsed,
  depth,
  expanded,
  toggle,
  onExpand,
  onParentClick,
}: {
  node: MenuNode;
  pathname: string;
  collapsed: boolean;
  depth: number;
  expanded: Set<string>;
  toggle: (id: string) => void;
  onExpand: () => void;
  onParentClick?: (e: React.MouseEvent) => void;
}) {
  const hasChildren = node.children.length > 0;
  const active =
    !!node.path &&
    (pathname === node.path || pathname.startsWith(node.path + "/"));
  const Icon = node.icon ? iconMap[node.icon] : undefined;

  // collapsed + 一级父菜单：有子菜单时弹出面板，无子菜单时直接跳转
  if (collapsed && depth === 0) {
    if (hasChildren) {
      return (
        <button
          type="button"
          onClick={onParentClick}
          title={node.name}
          className={cn(
            "flex w-full items-center justify-center rounded-xl py-2 transition-colors duration-150",
            active
              ? "bg-muted/60 text-primary"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          )}
        >
          {Icon ? <Icon className="size-4" /> : <span className="text-xs">{node.icon}</span>}
        </button>
      );
    }
    return (
      <Link
        href={node.path ?? "#"}
        title={node.name}
        className={cn(
          "flex items-center justify-center rounded-xl py-2 transition-colors duration-150",
          active
            ? "bg-muted/60 text-primary"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        )}
      >
        {Icon ? <Icon className="size-4" /> : <span className="text-xs">{node.icon}</span>}
      </Link>
    );
  }

  // 非 collapsed 态：原有树形逻辑
  if (hasChildren) {
    const isOpen = expanded.has(node.id);
    return (
      <div>
        <button
          type="button"
          onClick={() => toggle(node.id)}
          className={cn(
            "group flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[13px] transition-colors duration-150",
            active
              ? "bg-muted/60 font-medium text-primary"
              : "text-foreground hover:bg-muted/50"
          )}
        >
          {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
          <span className="flex-1 text-left">{node.name}</span>
          {isOpen
            ? <ChevronDown className="size-3.5 text-muted-foreground" />
            : <ChevronRight className="size-3.5 text-muted-foreground" />
          }
        </button>
        {isOpen && (
          <div className="ml-2 flex flex-col gap-0.5 border-l border-border/60 py-1 pl-3">
            {node.children.map((c) => (
              <MenuLink
                key={c.id}
                node={c}
                pathname={pathname}
                collapsed={collapsed}
                depth={depth + 1}
                expanded={expanded}
                toggle={toggle}
                onExpand={onExpand}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Link
      href={node.path ?? "#"}
      className={cn(
        "group relative flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] transition-colors duration-150",
        active
          ? "bg-muted/60 font-medium text-primary"
          : "text-foreground hover:bg-muted/50"
      )}
      style={{ paddingLeft: `${12 + depth * 20}px` }}
    >
      {active && (
        <span className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-sm bg-primary" />
      )}
      {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
      <span>{node.name}</span>
    </Link>
  );
}
