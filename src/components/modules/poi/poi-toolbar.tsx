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

import { usePoiQueryParams } from "./use-poi-query-params";

export type RegionOption = { id: string; name: string };

export function PoiToolbar({
  regions,
  selectedCount,
  onCreate,
  onImport,
  onExport,
  onBatchDelete,
}: {
  regions: RegionOption[];
  selectedCount: number;
  onCreate: () => void;
  onImport: () => void;
  onExport: () => void;
  onBatchDelete: () => void;
}) {
  const draft = usePoiQueryParams((s) => s.draft);
  const patchDraft = usePoiQueryParams((s) => s.patchDraft);
  const commit = usePoiQueryParams((s) => s.commit);
  const reset = usePoiQueryParams((s) => s.reset);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-40">
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

          <Input
            value={draft.type}
            onChange={(e) => patchDraft({ type: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
            }}
            placeholder="类型,如:医院"
            className="h-8 w-[150px] text-[13px]"
          />

          <SearchSelect
            value={draft.regionId}
            onValueChange={(v) => patchDraft({ regionId: v ? String(v) : "" })}
            options={[
              { value: "", label: "全部区划" },
              ...regions.map((r) => ({ value: r.id, label: r.name })),
            ]}
            placeholder="所属区划"
            triggerClassName="min-w-40"
          />

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

          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcw className="size-3.5" />
            重置
          </Button>

          <MotionButton size="sm" onClick={commit}>
            <SearchIcon className="size-3.5" />
            搜索
          </MotionButton>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {selectedCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={onBatchDelete}
            className="text-danger hover:bg-danger-soft"
          >
            <Trash2 className="size-3.5" />
            批量删除 {selectedCount} 条
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
          新建 POI
        </MotionButton>
      </div>
    </div>
  );
}