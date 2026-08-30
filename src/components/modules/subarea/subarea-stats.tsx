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

/** 子区域页顶部 4 个指标卡:总数 / 启用 / 禁用 / 覆盖区划数 */
export function SubareaStats({ stats }: { stats: Stats | undefined }) {
  if (!stats) return <StatCardsSkeleton cols={4} />;

  const items = [
    {
      key: "total",
      label: "子区域总数",
      value: stats.total,
      description: "知识库中全部子区域",
      Icon: Building2,
      tone: "bg-secondary text-foreground",
    },
    {
      key: "enabled",
      label: "启用",
      value: stats.enabled,
      description: "状态为启用",
      Icon: CheckCircle2,
      tone: "bg-success-soft text-success-fg",
    },
    {
      key: "disabled",
      label: "禁用",
      value: stats.disabled,
      description: "状态为禁用",
      Icon: XCircle,
      tone: "bg-danger-soft text-danger-fg",
    },
    {
      key: "regions",
      label: "覆盖区划",
      value: stats.regionCount,
      description: "已关联行政区划数",
      Icon: MapPin,
      tone: "bg-info-soft text-info-fg",
    },
  ] as const;

  return (
    <div className="flex flex-wrap gap-3">
      {items.map(({ key, label, value, description, Icon, tone }) => (
        <div key={key} className="w-3xs h-30">
          <Card className="h-full w-full flex flex-col gap-0 transition-shadow hover:border-ring/30 hover:shadow-md">
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
            <CardContent className="pt-1 pl-3">
              <span className="text-sm text-muted-foreground truncate mt-auto">
                {description}
              </span>
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
}