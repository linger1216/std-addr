"use client";

import { LogOut, Menu, User } from "lucide-react";
import { signOut } from "next-auth/react";

import { Button } from "@/components/ui/button";

export function Topbar({
  username,
  onToggle,
}: {
  username: string;
  onToggle: () => void;
}) {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background px-4">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          aria-label="切换侧边栏"
        >
          <Menu className="size-5" />
        </Button>
        <span className="font-semibold">后台管理</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <User className="size-4" />
          <span>{username}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="size-4" />
          退出登录
        </Button>
      </div>
    </header>
  );
}