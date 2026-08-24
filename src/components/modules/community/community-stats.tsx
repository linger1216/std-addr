"use client";

import { Building2, CheckCircle2, MapPin, XCircle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCardsSkeleton } from "@/components/ui/skeleton-blocks";

type Stats = {
  total: number;
  enabled: number;
  disabled: number;
  regionCount: number;
};

/**
 * 小区页顶部 4 个指标卡:总数 / 启用 / 禁用 / 覆盖区划数。
 * Apple 风:32px 数字 / 500 字重, hairline 边框,毛玻璃白底。
 */
export function CommunityStats({ stats }: { stats: Stats | undefined }) {
  if (!stats) return <StatCardsSkeleton cols={4} />;
  const items: Array<{
    key: string;
    label: string;
    value: number;
    Icon: React.ComponentType<{ className?: string }>;
    tone: string;
  }> = [
      {
        key: "total",
        label: "小区总数",
        value: stats?.total ?? 0,
        Icon: Building2,
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
      {
        key: "regions",
        label: "覆盖区划",
        value: stats?.regionCount ?? 0,
        Icon: MapPin,
        tone: "bg-info-soft text-info-fg",
      },
    ];

  return (
    <div className="flex flex-wrap gap-3">
      {items.map(({ key, label, value, Icon, tone }) => (
        <div
          key={key}
          className="w-3xs h-30"
        >
          {/* Card 本身仍然需要 flex flex-col，用来让 CardContent 占满剩余空间 */}
          <Card className="h-full w-full flex flex-col gap-0 transition-shadow hover:shadow-md">
            <CardHeader className="p-3">
              <div className="flex items-center justify-between">
                <CardTitle className="font-mono text-sm font-medium uppercase tracking-wider text-muted-foreground truncate">
                  {label}
                </CardTitle>
                <div className={`flex size-6 items-center justify-center rounded-xl ${tone}`}>
                  <Icon className="size-4" />
                </div>
              </div>
              <div className="text-3xl font-semibold tracking-tight leading-none truncate">
                {value.toLocaleString()}
              </div>
            </CardHeader>

            {/* 去掉 flex items-end，用 mt-auto 将文本推到底部，同时保留 pb-1 底部间隔 */}
            <CardContent className="pt-1 pl-3">
              <span className="text-sm text-muted-foreground truncate mt-auto">
                {key === "regions"
                  ? "已关联行政区划数"
                  : key === "total"
                    ? "知识库中全部小区"
                    : key === "enabled"
                      ? "状态为启用"
                      : "状态为禁用"}
              </span>
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
}
