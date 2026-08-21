"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  Menu as MenuIcon,
  Settings,
  Shield,
  Users,
  type LucideIcon,
} from "lucide-react";

import { type MenuNode } from "@/server/api/routers/menu";

const iconMap: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  settings: Settings,
  users: Users,
  shield: Shield,
  menu: MenuIcon,
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

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <aside
      className={`flex shrink-0 flex-col border-r bg-background transition-all duration-200 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
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
          />
        ))}
      </nav>
    </aside>
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
}: {
  node: MenuNode;
  pathname: string;
  collapsed: boolean;
  depth: number;
  expanded: Set<string>;
  toggle: (id: string) => void;
  onExpand: () => void;
}) {
  const hasChildren = node.children.length > 0;
  const active =
    !!node.path &&
    (pathname === node.path || pathname.startsWith(node.path + "/"));
  const Icon = node.icon ? iconMap[node.icon] : undefined;

  // 折叠态: 只渲染顶层, 父菜单点击即展开侧边栏
  if (collapsed && depth === 0) {
    if (hasChildren) {
      return (
        <button
          type="button"
          onClick={onExpand}
          title={`${node.name} (展开侧边栏)`}
          className={`flex w-full items-center justify-center rounded-md py-2 ${
            active
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          {Icon ? (
            <Icon className="size-5" />
          ) : (
            <span className="text-xs">{node.icon}</span>
          )}
        </button>
      );
    }
    return (
      <Link
        href={node.path ?? "#"}
        title={node.name}
        className={`flex items-center justify-center rounded-md py-2 ${
          active
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        {Icon ? (
          <Icon className="size-5" />
        ) : (
          <span className="text-xs">{node.icon}</span>
        )}
      </Link>
    );
  }

  // 展开态: 父菜单可折叠
  if (hasChildren) {
    const isOpen = expanded.has(node.id);
    return (
      <div>
        <button
          type="button"
          onClick={() => toggle(node.id)}
          className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm ${
            active
              ? "bg-primary/10 text-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
        >
          {Icon && <Icon className="size-4 shrink-0" />}
          <span className="flex-1 text-left">{node.name}</span>
          {isOpen ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
        </button>
        {isOpen && (
          <div className="mt-1 space-y-1">
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

  // 叶子节点
  return (
    <Link
      href={node.path ?? "#"}
      className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
      style={{ paddingLeft: `${12 + depth * 16}px` }}
    >
      {Icon && <Icon className="size-4 shrink-0" />}
      <span>{node.name}</span>
    </Link>
  );
}