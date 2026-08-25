"use client";

import { useState } from "react";

import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { PageTransition } from "@/components/layout/page-transition";
import { RouteProgress } from "@/components/layout/route-progress";
import { type MenuNode } from "@/server/api/routers/menu";

export function SidebarProvider({
  menus,
  username,
  children,
}: {
  menus: MenuNode[];
  username: string;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="flex h-screen">
      <Sidebar
        menus={menus}
        collapsed={collapsed}
        onExpand={() => setCollapsed(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <RouteProgress />
        <Topbar username={username} onToggle={() => setCollapsed((c) => !c)} />
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 pt-6 pb-10">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}