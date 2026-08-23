"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell,
  LogOut,
  Menu,
  Moon,
  Search,
  Sun,
} from "lucide-react";
import { signOut } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Crumb = { label: string; href?: string };

function buildCrumbs(pathname: string): Crumb[] {
  const map: Record<string, string> = {
    "": "工作台",
    users: "用户管理",
    roles: "角色管理",
    menus: "菜单管理",
    logs: "系统日志",
    settings: "个人中心",
    "std-addr": "标准地址库",
    "addr-parse": "地址解析",
    "addr-sim": "地址模拟",
    knowledge: "知识库",
  };
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return [{ label: "工作台" }];
  const out: Crumb[] = [{ label: "首页", href: "/" }];
  parts.forEach((p, i) => {
    const label = map[p] ?? p;
    const href = i === parts.length - 1 ? undefined : "/" + parts.slice(0, i + 1).join("/");
    out.push({ label, href });
  });
  return out;
}

export function Topbar({ username, onToggle }: { username: string; onToggle: () => void }) {
  const pathname = usePathname();
  const crumbs = buildCrumbs(pathname);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved = (localStorage.getItem("std-addr.theme") as "light" | "dark") ?? "light";
    setTheme(saved);
    document.documentElement.classList.toggle("dark", saved === "dark");
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem("std-addr.theme", next);
  };

  return (
    <header className="sticky top-0 z-20 flex h-12 items-center justify-between gap-4 border-b border-border bg-background/95 px-5 backdrop-blur-sm">
      <div className="flex min-w-0 items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onToggle} aria-label="切换侧边栏" className="size-8">
          <Menu className="size-4" />
        </Button>
        <nav aria-label="breadcrumb" className="flex min-w-0 items-center gap-1 text-[13px] text-muted-foreground">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="mx-0.5 opacity-40">/</span>}
              {c.href ? (
                <Link href={c.href} className="hover:text-foreground">
                  {c.label}
                </Link>
              ) : (
                <span className="font-medium text-foreground">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-1.5">
        {/* 搜索 */}
        <div className="relative hidden md:block">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索…"
            className="h-8 w-[260px] border-transparent bg-secondary pl-8 pr-3 text-[13px]"
          />
        </div>

        {/* 通知 */}
        <Button variant="ghost" size="icon" aria-label="通知" className="relative size-8">
          <Bell className="size-4" />
          <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-danger" />
        </Button>

        {/* 主题 */}
        <Button variant="ghost" size="icon" aria-label="切换主题" onClick={toggleTheme} className="size-8">
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>

        <div className="mx-1 h-5 w-px bg-border" />

        {/* 用户 */}
        <div className="flex items-center gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[12px] font-medium text-foreground">
            {username.slice(0, 1)}
          </div>
          <span className="hidden text-[13px] sm:block">{username}</span>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="gap-1.5 text-[12px]"
        >
          <LogOut className="size-3.5" />
          <span className="hidden sm:inline">退出</span>
        </Button>
      </div>
    </header>
  );
}
