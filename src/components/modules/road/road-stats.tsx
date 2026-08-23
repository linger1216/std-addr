"use client";

import { CheckCircle2, Route, XCircle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCardsSkeleton } from "@/components/ui/skeleton-blocks";

type Stats = {
  total: number;
  enabled: number;
  disabled: number;
};

/** 道路页顶部 3 个指标卡:总数 / 启用 / 禁用。 */
export function RoadStats({ stats }: { stats: Stats | undefined }) {
  if (!stats) return <StatCardsSkeleton cols={3} count={3} />;
  const items: Array<{
    key: string;
    label: string;
    value: number;
    Icon: React.ComponentType<{ className?: string }>;
    tone: string;
  }> = [
    {
      key: "total",
      label: "道路总数",
      value: stats?.total ?? 0,
      Icon: Route,
      tone: "bg-secondary text-foreground",
    },
    {
      key: "enabled",
      label: "启用",
      value: stats?.enabled ?? 0,
      Icon: CheckCircle2,
      tone: "bg-success-soft text-success-fg",
    },
    {
      key: "disabled",
      label: "禁用",
      value: stats?.disabled ?? 0,
      Icon: XCircle,
      tone: "bg-danger-soft text-danger-fg",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(({ key, label, value, Icon, tone }) => (
        <Card key={key} className="p-5">
          <CardHeader className="gap-3 p-0">
            <div className="flex items-center justify-between">
              <CardTitle className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {label}
              </CardTitle>
              <div
                className={`flex size-9 items-center justify-center rounded-xl ${tone}`}
              >
                <Icon className="size-4" />
              </div>
            </div>
            <div className="text-[32px] font-semibold tracking-[-0.02em] leading-none">
              {value.toLocaleString()}
            </div>
          </CardHeader>
          <CardContent className="p-0 pt-3">
            <span className="text-[11.5px] text-muted-foreground">
              {key === "total"
                ? "知识库中全部道路"
                : key === "enabled"
                  ? "状态为启用"
                  : "状态为禁用"}
            </span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}