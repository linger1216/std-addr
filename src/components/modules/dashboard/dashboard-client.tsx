"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  LayoutDashboard,
  Shield,
  UserCog,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Reveal } from "@/components/ui/reveal";
import { cn } from "@/lib/utils";

type StatCard = { key: string; label: string; value: number; trend: number };
type SeriesPoint = { label: string; count: number };
type RecentItem = {
  id: string;
  username: string;
  name: string | null;
  role: { name: string } | null;
};

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  users: Users,
  active: UserCog,
  menus: LayoutDashboard,
  roles: Shield,
};

export function DashboardClient({
  username,
  stats,
  recent,
}: {
  username: string;
  stats: { cards: StatCard[]; series: SeriesPoint[] };
  recent: RecentItem[];
}) {
  const [tab, setTab] = useState<"overview" | "trend" | "audit">("overview");
  const max = Math.max(1, ...stats.series.map((s) => s.count));

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-[28px] font-semibold leading-tight tracking-[-0.02em]">
            仪表盘
          </h1>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            欢迎回来，{username} · 今天{" "}
            {new Date().toLocaleDateString("zh-CN", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        {/* Tab switcher */}
        <div className="inline-flex items-center gap-1 rounded-2xl bg-secondary/80 p-1">
          {(["overview", "trend", "audit"] as const).map((k) => (
            <button
              key={k}
              type="button"
              data-active={tab === k}
              onClick={() => setTab(k)}
              className={cn(
                "rounded-xl px-4 py-1.5 text-[12.5px] font-medium transition-all",
                tab === k
                  ? "bg-background text-foreground shadow-[0_1px_3px_rgba(0,0,0,.08)]"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {k === "overview" ? "概览" : k === "trend" ? "趋势" : "审计"}
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <Reveal>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.cards.map((c) => {
          const Icon = ICONS[c.key] ?? Users;
          const up = c.trend >= 0;
          return (
            <Card key={c.key} className="p-5">
              <CardHeader className="gap-3 p-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {c.label}
                  </CardTitle>
                  <div className="flex size-9 items-center justify-center rounded-xl bg-secondary text-foreground">
                    <Icon className="size-4" />
                  </div>
                </div>
                <div className="text-[32px] font-semibold tracking-[-0.02em] leading-none">
                  {c.value.toLocaleString()}
                </div>
              </CardHeader>
              <CardContent className="flex items-center justify-between p-0 pt-3">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium",
                    up
                      ? "bg-success-soft text-success-fg"
                      : "bg-danger-soft text-danger-fg"
                  )}
                >
                  {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                  {Math.abs(c.trend)}%
                </span>
                <span className="text-[11.5px] text-muted-foreground">较上周</span>
              </CardContent>
            </Card>
          );
        })}
      </div>
      </Reveal>

      {/* Bottom row */}
      <Reveal delay={100}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        {/* 角色分布 */}
        <Card className="p-5">
          <CardHeader className="p-0 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-[15px] font-semibold">用户角色分布</CardTitle>
                <p className="mt-1 text-[12px] text-muted-foreground">各角色下的用户数量</p>
              </div>
              <Badge variant="secondary" className="text-[11px]">
                {stats.series.reduce((a, b) => a + b.count, 0)} 累计
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="relative h-[200px] w-full">
              <Sparkline points={stats.series} max={max} />
            </div>
          </CardContent>
        </Card>

        {/* 最近用户 */}
        <Card className="p-5">
          <CardHeader className="p-0 pb-4">
            <div>
              <CardTitle className="text-[15px] font-semibold">最近用户</CardTitle>
              <p className="mt-1 text-[12px] text-muted-foreground">按 ID 倒序前 6 名</p>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border/60">
              {recent.map((r) => (
                <li key={r.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px]">
                      {r.name ?? r.username}
                    </div>
                    <div className="truncate text-[11.5px] text-muted-foreground">
                      {r.role?.name ?? "未分配"} · @{r.username}
                    </div>
                  </div>
                </li>
              ))}
              {recent.length === 0 && (
                <li className="py-8 text-center text-[12.5px] text-muted-foreground">
                  暂无活动
                </li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
      </Reveal>
    </div>
  );
}

function Sparkline({ points, max }: { points: SeriesPoint[]; max: number }) {
  const path = useMemo(() => {
    const w = 600;
    const h = 160;
    const pad = 8;
    const stepX = (w - pad * 2) / Math.max(1, points.length - 1);
    const coords = points.map((p, i) => {
      const x = pad + i * stepX;
      const y = pad + (1 - p.count / max) * (h - pad * 2);
      return [x, y] as const;
    });
    const line = coords
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
      .join(" ");
    return { line, coords };
  }, [points, max]);

  return (
    <svg viewBox="0 0 600 160" preserveAspectRatio="none" className="h-full w-full">
      <path
        d={path.line}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {path.coords.map(([x, y], i) =>
        points[i] && points[i].count > 0 ? (
          <circle key={i} cx={x} cy={y} r="2.5" fill="var(--primary)" />
        ) : null
      )}
    </svg>
  );
}
