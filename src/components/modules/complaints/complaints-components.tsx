"use client";

import { Building2, DoorOpen, User, MapPin, ChevronRight, Search, Users, Layers } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";

import { api } from "@/trpc/react";
import type {
  DupGroup,
  TownReport,
  PersonHouseTree,
  AreaKind,
  UnitNode,
  PersonRow,
  RoomNode,
} from "@/server/api/routers/complains";

export type ComplaintsFilters = {
  cgType?: string;
  startDate?: string;
  endDate?: string;
  keyword?: string;
};

/** 公共筛选工具条(重复诉件 / 人房 共用) */
export function ComplaintsFilter({
  filters,
  onChange,
  onSearch,
  onReset,
  loading,
}: {
  filters: ComplaintsFilters;
  onChange: (f: ComplaintsFilters) => void;
  onSearch: () => void;
  onReset: () => void;
  loading?: boolean;
}) {
  const { data: types = [] } = api.complains.types.useQuery();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">筛选</CardTitle>
        <CardDescription>按城管类型、发现时间区间、关键字过滤后查询。</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>城管类型</span>
            <select
              className="h-9 w-48 rounded-md border border-input bg-background px-2 text-sm"
              value={filters.cgType ?? ""}
              onChange={(e) =>
                onChange({ ...filters, cgType: e.target.value || undefined })
              }
            >
              <option value="">全部</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>发现时间起</span>
            <Input
              type="date"
              className="h-9 w-44"
              value={filters.startDate ?? ""}
              onChange={(e) =>
                onChange({ ...filters, startDate: e.target.value || undefined })
              }
            />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>发现时间止</span>
            <Input
              type="date"
              className="h-9 w-44"
              value={filters.endDate ?? ""}
              onChange={(e) =>
                onChange({ ...filters, endDate: e.target.value || undefined })
              }
            />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>关键字(地址)</span>
            <Input
              placeholder="地址包含…"
              className="h-9 w-52"
              value={filters.keyword ?? ""}
              onChange={(e) =>
                onChange({ ...filters, keyword: e.target.value || undefined })
              }
            />
          </label>
          <Button onClick={onSearch} disabled={loading}>
            <Search className="mr-1 h-4 w-4" />
            查询
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              onChange({});
              onReset();
            }}
          >
            重置
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function TownCard({ town }: { town: TownReport }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="truncate text-sm font-medium">{town.town}</span>
        <Badge variant="secondary">{town.totalComplaints}</Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {town.totalGroups} 组 · Top类型 {town.topTypes[0]?.type ?? "—"} ({town.topTypes[0]?.count ?? 0})
      </p>
    </div>
  );
}

export function DupTable({ groups }: { groups: DupGroup[] }) {
  return (
    <div className="max-h-[420px] overflow-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>标准地址</TableHead>
            <TableHead>原始地址</TableHead>
            <TableHead>类型</TableHead>
            <TableHead>月份</TableHead>
            <TableHead className="text-right">次数</TableHead>
            <TableHead>首/末次</TableHead>
            <TableHead className="text-right">诉件数</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((g) => (
            <TableRow key={`${g.groupKey}|${g.cgType}|${g.month}`}>
              <TableCell className="max-w-[240px] truncate">{g.stdAddress || "—"}</TableCell>
              <TableCell className="max-w-[200px] truncate text-muted-foreground">
                {g.address || "—"}
              </TableCell>
              <TableCell>{g.cgType || "—"}</TableCell>
              <TableCell>{g.month}</TableCell>
              <TableCell className="text-right font-medium">{g.count}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {g.firstDate}
                <br />
                {g.lastDate}
              </TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">
                {g.taskIds.length}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function PersonHouseTree({ tree }: { tree: PersonHouseTree }) {
  if (tree.areas.length === 0) {
    return <p className="text-sm text-muted-foreground">该时间范围内无非匿名人员记录。</p>;
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <StatBadge label="区域" value={tree.stats.areas} />
        <StatBadge label="楼栋" value={tree.stats.buildings} />
        <StatBadge label="室号" value={tree.stats.rooms} />
        <StatBadge label="人员" value={tree.stats.persons} />
      </div>

      <div className="space-y-2">
        {tree.areas.map((c) => {
          const meta = AREA_META[c.kind];
          const Icon = meta.icon;
          return (
            <Collapsible
              key={`${c.kind}::${c.name}`}
              defaultOpen={tree.areas.length <= 8}
            >
              <CollapsibleTrigger className="group flex w-full items-center gap-2.5 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent/40">
                <Icon className={`size-4 shrink-0 ${meta.color}`} />
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {meta.label}
                </span>
                <span className="truncate font-medium">{c.name}</span>
                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                  {c.kind === "community" && (
                    <Badge variant="secondary">{c.buildingCount} 栋</Badge>
                  )}
                  {c.kind === "village" && (
                    <Badge variant="secondary">{c.units.length} 队组</Badge>
                  )}
                  {c.kind === "poi" && (
                    <Badge variant="secondary">{c.persons.length} 人</Badge>
                  )}
                  <Badge variant="secondary">{c.personCount} 人</Badge>
                  <ChevronRight className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="pl-4 pt-2">
                <div className="space-y-2 border-l pl-3">
                  {c.kind === "community" &&
                    c.buildings.map((b) => (
                      <Collapsible key={b.name}>
                        <CollapsibleTrigger className="group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/40">
                          <DoorOpen className="size-4 shrink-0 text-amber-600" />
                          <span className="truncate text-sm">{b.name}</span>
                          <div className="ml-auto flex shrink-0 items-center gap-1.5">
                            <Badge variant="outline">{b.roomCount} 室</Badge>
                            <Badge variant="outline">{b.personCount} 人</Badge>
                            <ChevronRight className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pl-4 pt-1.5">
                          <div className="space-y-1.5 border-l pl-3">
                            {b.rooms.map((r) => (
                              <RoomNodeView key={r.name} room={r} />
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    ))}

                  {c.kind === "village" &&
                    c.units.map((u) => (
                      <UnitNodeView key={`${u.unitKind}::${u.name}`} unit={u} />
                    ))}

                  {c.kind === "poi" && (
                    <div className="grid grid-cols-1 gap-1.5 pl-3 sm:grid-cols-2 lg:grid-cols-3">
                      {c.persons.map((p) => (
                        <PersonCard key={p.taskId} person={p} />
                      ))}
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}

/** 室号 → 人员(小区楼栋下) */
function RoomNodeView({ room }: { room: RoomNode }) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded px-2 py-1 text-left transition-colors hover:bg-accent/40">
        <span className="truncate text-[13px] text-muted-foreground">{room.name}</span>
        <Badge variant="secondary" className="ml-auto shrink-0">
          {room.personCount} 人
        </Badge>
        <ChevronRight className="size-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-1.5">
        <div className="grid grid-cols-1 gap-1.5 pl-3 sm:grid-cols-2 lg:grid-cols-3">
          {room.persons.map((p) => (
            <PersonCard key={p.taskId} person={p} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** 村 队 / 组 单元 → 人员 */
function UnitNodeView({ unit }: { unit: UnitNode }) {
  const Icon = unit.unitKind === "team" ? Users : Layers;
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/40">
        <Icon className="size-4 shrink-0 text-violet-600" />
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
          {unit.unitKind === "team" ? "队" : "组"}
        </span>
        <span className="truncate text-sm">{unit.name}</span>
        <Badge variant="outline" className="ml-auto shrink-0">
          {unit.personCount} 人
        </Badge>
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-4 pt-1.5">
        <div className="grid grid-cols-1 gap-1.5 border-l pl-3 sm:grid-cols-2 lg:grid-cols-3">
          {unit.persons.map((p) => (
            <PersonCard key={p.taskId} person={p} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** 单个人员卡片(室号 / 队组 / POI 共用) */
function PersonCard({ person }: { person: PersonRow }) {
  return (
    <div className="rounded-md border bg-background/60 p-2">
      <div className="flex items-center gap-1.5">
        <User className="size-3.5 shrink-0 text-sky-600" />
        <span className="truncate text-sm font-medium">{person.reporter}</span>
        {person.contactInfo && (
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            {person.contactInfo}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
        <MapPin className="size-3 shrink-0" />
        <span className="truncate">{person.address || "—"}</span>
      </div>
      {person.stdAddress && (
        <div className="truncate text-[11px] text-emerald-700 dark:text-emerald-500">
          {person.stdAddress}
        </div>
      )}
    </div>
  );
}

const AREA_META: Record<
  AreaKind,
  { label: string; icon: typeof Building2; color: string }
> = {
  community: { label: "小区", icon: Building2, color: "text-emerald-600" },
  poi: { label: "POI", icon: MapPin, color: "text-sky-600" },
  village: { label: "村", icon: Building2, color: "text-violet-600" },
};

function StatBadge({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </span>
  );
}
