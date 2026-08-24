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

import { useCommunityFilters } from "./use-community-filters";

export type RegionOption = { id: string; name: string };

export function CommunityToolbar({
  regions,
  selectedCount,
  onCreate,
  onImport,
  onBatchDelete,
}: {
  regions: RegionOption[];
  selectedCount: number;
  onCreate: () => void;
  onImport: () => void;
  onBatchDelete: () => void;
}) {
  // ponytail: 筛选状态由 zustand 管理,toolbar 直接读写 store。
  const draft = useCommunityFilters((s) => s.draft);
  const patchDraft = useCommunityFilters((s) => s.patchDraft);
  const commit = useCommunityFilters((s) => s.commit);
  const reset = useCommunityFilters((s) => s.reset);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <div className="relative w-70">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={draft.q}
            onChange={(e) => patchDraft({ q: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
            }}
            placeholder="搜索名称 / 别名"
            className="h-8 pl-8 pr-3 text-[13px]"
          />
        </div>

        <Select
          value={draft.regionId}
          items={[
            { value: "", label: "全部区划" },
            ...regions.map((r) => ({ value: r.id, label: r.name })),
          ]}
          onValueChange={(v) => patchDraft({ regionId: v ? String(v) : "" })}
        >
          <SelectTrigger className="h-8 min-w-40 rounded-xl text-[13px]">
            <SelectValue placeholder="所属区划" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">全部区划</SelectItem>
            {regions.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={draft.status}
          items={[
            { value: "", label: "全部状态" },
            { value: "1", label: "启用" },
            { value: "0", label: "禁用" },
          ]}
          onValueChange={(v) => patchDraft({ status: v ?? "" })}
        >
          <SelectTrigger className="h-8 min-w-40 rounded-xl text-[13px]">
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
          新建小区
        </Button>
      </div>
    </div>
  );
}