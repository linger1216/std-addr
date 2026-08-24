"use client";

import {
  Download,
  Plus,
  RotateCcw,
  Search,
  SearchIcon,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useRoadFilters } from "./use-road-filters";

export function RoadToolbar({
  selectedCount,
  onCreate,
  onImport,
  onBatchDelete,
}: {
  selectedCount: number;
  onCreate: () => void;
  onImport: () => void;
  onBatchDelete: () => void;
}) {
  // ponytail: 筛选 state 由 useRoadFilters(zustand) 管理
  const draft = useRoadFilters((s) => s.draft);
  const patchDraft = useRoadFilters((s) => s.patchDraft);
  const commit = useRoadFilters((s) => s.commit);
  const reset = useRoadFilters((s) => s.reset);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <div className="relative w-[280px]">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={draft.q}
            onChange={(e) => patchDraft({ q: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
            }}
            placeholder="搜索道路名"
            className="h-8 border-transparent bg-secondary pl-8 pr-3 text-[13px]"
          />
        </div>

        <Select
          value={draft.status}
          items={[
            { value: "", label: "全部状态" },
            { value: "1", label: "启用" },
            { value: "0", label: "禁用" },
          ]}
          onValueChange={(v) => patchDraft({ status: v ?? "" })}
        >
          <SelectTrigger className="h-8 min-w-[120px] rounded-xl bg-secondary text-[13px]">
            <SelectValue placeholder="状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">全部状态</SelectItem>
            <SelectItem value="1">启用</SelectItem>
            <SelectItem value="0">禁用</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="ghost" size="sm" onClick={reset}>
          <RotateCcw className="size-3.5" />
          重置
        </Button>

        <Button size="sm" onClick={commit}>
          <SearchIcon className="size-3.5" />
          搜索
        </Button>

        {selectedCount > 0 && (
          <span className="ml-2 text-[12.5px] text-muted-foreground">
            已选 {selectedCount} 条
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {selectedCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onBatchDelete}
            className="text-danger hover:bg-danger-soft"
          >
            <Trash2 className="size-3.5" />
            批量删除
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onImport}>
          <Download className="size-3.5" />
          导入
        </Button>
        <Button size="sm" onClick={onCreate}>
          <Plus className="size-3.5" />
          新建道路
        </Button>
      </div>
    </div>
  );
}