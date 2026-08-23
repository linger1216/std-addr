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

export type RegionOption = { id: string; name: string };

export type VillageFilters = {
  q: string;
  regionId: string;
  status: "" | "0" | "1";
};

export const EMPTY_FILTERS: VillageFilters = {
  q: "",
  regionId: "",
  status: "",
};

export function VillageToolbar({
  filters,
  onChange,
  onReset,
  onSubmit,
  regions,
  selectedCount,
  onCreate,
  onImport,
  onBatchDelete,
}: {
  filters: VillageFilters;
  onChange: (next: VillageFilters) => void;
  onReset: () => void;
  onSubmit: () => void;
  regions: RegionOption[];
  selectedCount: number;
  onCreate: () => void;
  onImport: () => void;
  onBatchDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <div className="relative w-[280px]">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.q}
            onChange={(e) => onChange({ ...filters, q: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmit();
            }}
            placeholder="搜索名称 / 别名"
            className="h-8 border-transparent bg-secondary pl-8 pr-3 text-[13px]"
          />
        </div>

        <Select
          value={filters.regionId || "_all"}
          onValueChange={(v) =>
            onChange({
              ...filters,
              regionId: v && v !== "_all" ? String(v) : "",
            })
          }
        >
          <SelectTrigger className="h-8 min-w-[150px] rounded-xl bg-secondary text-[13px]">
            <SelectValue placeholder="所属区划" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">全部区划</SelectItem>
            {regions.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.status || "_all"}
          onValueChange={(v) =>
            onChange({
              ...filters,
              status: v && v !== "_all" ? (v as "0" | "1") : "",
            })
          }
        >
          <SelectTrigger className="h-8 min-w-[120px] rounded-xl bg-secondary text-[13px]">
            <SelectValue placeholder="状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">全部状态</SelectItem>
            <SelectItem value="1">启用</SelectItem>
            <SelectItem value="0">禁用</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="ghost" size="sm" onClick={onReset}>
          <RotateCcw className="size-3.5" />
          重置
        </Button>

        <Button size="sm" onClick={onSubmit}>
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
          新建村
        </Button>
      </div>
    </div>
  );
}