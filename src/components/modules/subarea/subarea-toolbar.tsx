"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  Download,
  Plus,
  RotateCcw,
  Search,
  SearchIcon,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { Button, MotionButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchSelect } from "@/components/ui/search-select";
import { useSubareaQueryParams } from "./use-subarea-query-params";

export type RegionOption = { id: string; name: string };

export function SubareaToolbar({
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
  const draft = useSubareaQueryParams((s) => s.draft);
  const patchDraft = useSubareaQueryParams((s) => s.patchDraft);
  const commit = useSubareaQueryParams((s) => s.commit);
  const reset = useSubareaQueryParams((s) => s.reset);

  return (
    <div className="space-y-3">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {/* 关键字搜索 */}
        <div className="relative w-70">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={draft.q}
            onChange={(e) => patchDraft({ q: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
            }}
            placeholder="搜索名称 / 别名"
            className="h-8 border-transparent pl-8 pr-7 text-[13px]"
          />
          {/* 清空按钮:仅在有内容时显示,只清 draft 不 commit,
              让用户可以继续输入或点搜索按钮 */}
          <AnimatePresence>
            {draft.q && (
              <motion.button
                type="button"
                aria-label="清空搜索"
                title="清空搜索"
                onClick={() => patchDraft({ q: "" })}
                onMouseDown={(e) => e.preventDefault()}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.12 }}
                className="pointer-events-auto absolute top-1/2 right-2 flex size-4 -translate-y-1/2 items-center justify-center rounded-full
                text-muted-foreground transition-colors
                hover:bg-secondary hover:text-foreground
                focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <X className="size-3" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* 区划筛选 */}
        <SearchSelect
          value={draft.regionId}
          onValueChange={(v) => patchDraft({ regionId: v ?? "" })}
          options={[
            { value: "", label: "全部区划" },
            ...regions.map((r) => ({ value: r.id, label: r.name })),
          ]}
          placeholder="所属区划"
          triggerClassName="min-w-50"
        />

        {/* 状态筛选 */}
        <SearchSelect<string>
          value={draft.status}
          onValueChange={(v) =>
            patchDraft({ status: v === "1" || v === "0" ? v : "" })
          }
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

      <div className="flex items-center gap-2 justify-end">
        {selectedCount > 0 && (
          <Button
            variant="outline"
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
          新建子区域
        </MotionButton>
      </div>
    </div>
  );
}
