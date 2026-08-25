"use client";

import {
  Download,
  Upload,
  Plus,
  RotateCcw,
  Search,
  SearchIcon,
  Trash2,
} from "lucide-react";

import { Button, MotionButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchSelect } from "@/components/ui/search-select";

import { useRoadFilters } from "./use-road-filters";

export function RoadToolbar({
  selectedCount,
  onCreate,
  onImport,
  onExport,
  onBatchDelete,
}: {
  selectedCount: number;
  onCreate: () => void;
  onImport: () => void;
  onExport: () => void;
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

        <SearchSelect<string>
          value={draft.status}
          onValueChange={(v) => patchDraft({ status: v ?? "" })}
          options={[
            { value: "", label: "全部状态" },
            { value: "1", label: "启用" },
            { value: "0", label: "禁用" },
          ]}
          placeholder="状态"
          triggerClassName="min-w-40"
        />

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
        <Button variant="outline" size="sm" onClick={onExport}>
          <Download className="size-3.5" />
          导出
        </Button>
        <Button variant="outline" size="sm" onClick={onImport}>
          <Upload className="size-3.5" />
          导入
        </Button>
        <MotionButton size="sm" onClick={onCreate}>
          <Plus className="size-3.5" />
          新建道路
        </MotionButton>
      </div>
    </div>
  );
}