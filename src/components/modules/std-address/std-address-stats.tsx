"use client";

import { CheckCircle2, Star, Hourglass, MapPin } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCardsSkeleton } from "@/components/ui/skeleton-blocks";

type Stats = {
  total: number;
  standardized: number;
  pending: number;
  /** Decimal 序列化后可能是 string/number/null */
  avgScore: unknown;
};

/** 标准地址库顶部 4 个指标卡:总数 / 已标准化 / 待标准化 / 平均评分 */
export function StdAddressStats({ stats }: { stats: Stats | undefined }) {
  if (!stats) return <StatCardsSkeleton cols={4} />;

  const avgScore =
    stats.avgScore === null || stats.avgScore === undefined
      ? "—"
      : Number(stats.avgScore).toFixed(1);

  const items = [
    {
      key: "total",
      label: "地址总数",
      value: stats.total.toLocaleString(),
      description: "库内全部原始地址",
      Icon: MapPin,
      tone: "bg-secondary text-foreground",
    },
    {
      key: "standardized",
      label: "已标准化",
      value: stats.standardized.toLocaleString(),
      description: "已产出标准地址",
      Icon: CheckCircle2,
      tone: "bg-success-soft text-success-fg",
    },
    {
      key: "pending",
      label: "待标准化",
      value: stats.pending.toLocaleString(),
      description: "仅存原始地址",
      Icon: Hourglass,
      tone: "bg-danger-soft text-danger-fg",
    },
    {
      key: "avgScore",
      label: "平均评分",
      value: avgScore,
      description: "已标准化记录的平均分",
      Icon: Star,
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
                {value}
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