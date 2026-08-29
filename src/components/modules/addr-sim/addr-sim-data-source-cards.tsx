"use client";

import { Building2, MapPin, Road, Tags, TreePine } from "lucide-react";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCardsSkeleton } from "@/components/ui/skeleton-blocks";

export interface AddrSimStats {
  sources: {
    road: number;
    community: number;
    village: number;
    poi: number;
  };
  labelCount: number;
}

/** 顶部数据源卡片:四种实体条目数 + 地址要素总数(标注字段来源)。 */
export function AddrSimDataSourceCards({
  stats,
}: {
  stats: AddrSimStats | undefined;
}) {
  if (!stats) return <StatCardsSkeleton cols={4} count={4} />;

  const items: Array<{
    key: string;
    label: string;
    value: number;
    Icon: React.ComponentType<{ className?: string }>;
    tone: string;
    desc: string;
  }> = [
    {
      key: "road",
      label: "道路",
      value: stats.sources.road,
      Icon: Road,
      tone: "bg-secondary text-foreground",
      desc: "road 表(路名候选)",
    },
    {
      key: "community",
      label: "小区",
      value: stats.sources.community,
      Icon: Building2,
      tone: "bg-success-soft text-success-fg",
      desc: "community 表(小区名候选)",
    },
    {
      key: "village",
      label: "村",
      value: stats.sources.village,
      Icon: TreePine,
      tone: "bg-primary-soft text-primary",
      desc: "village 表(村名候选)",
    },
    {
      key: "poi",
      label: "POI",
      value: stats.sources.poi,
      Icon: MapPin,
      tone: "bg-warn-soft text-warn-fg",
      desc: "poi 表(兴趣点候选)",
    },
    {
      key: "labels",
      label: "地址要素",
      value: stats.labelCount,
      Icon: Tags,
      tone: "bg-danger-soft text-danger-fg",
      desc: "label 表(标注字段来源)",
    },
  ];

  return (
    <Card className="p-4">
      <CardHeader className="p-0">
        <CardTitle className="text-[13px]">数据源</CardTitle>
      </CardHeader>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {items.map(({ key, label, value, Icon, tone, desc }) => (
          <div
            key={key}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
          >
            <div
              className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${tone}`}
            >
              <Icon className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[17px] font-semibold leading-none tabular-nums">
                {value.toLocaleString()}
              </div>
              <div className="mt-1 truncate text-[11px] text-muted-foreground">
                {label}
                <span className="ml-1 hidden sm:inline text-[10px] opacity-70">
                  {desc}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}