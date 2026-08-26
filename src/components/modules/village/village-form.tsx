"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchSelect } from "@/components/ui/search-select";
import type { RegionOption } from "@/components/modules/village/village-toolbar";

export type VillageFormValues = {
  id?: string | null;
  name: string;
  alias: string;
  regionId: string;
  status: 0 | 1;
};

export type VillageDetail = {
  id: string;
  name: string;
  alias: string | null;
  regionId: string | null;
  status: number;
  createdAt: Date;
  updatedAt: Date;
};

const EMPTY: VillageFormValues = {
  id: null,
  name: "",
  alias: "",
  regionId: "",
  status: 1,
};

export function VillageFormDialog({
  open,
  onOpenChange,
  initial,
  regions,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  initial: VillageDetail | VillageFormValues | null;
  regions: RegionOption[];
  onSubmit: (values: VillageFormValues) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState<VillageFormValues>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const isEdit = useMemo(() => {
    if (!initial) return false;
    if ("createdAt" in initial) return true;
    return Boolean(initial.id);
  }, [initial]);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      if ("createdAt" in initial) {
        setForm({
          id: initial.id,
          name: initial.name,
          alias: initial.alias ?? "",
          regionId: initial.regionId ?? "",
          status: initial.status === 0 ? 0 : 1,
        });
      } else {
        setForm({ ...EMPTY, ...initial });
      }
    } else {
      setForm(EMPTY);
    }
    setError(null);
  }, [open, initial]);

  function handleSubmit() {
    setError(null);
    if (!form.name.trim()) {
      setError("请输入村名称");
      return;
    }
    onSubmit({
      id: form.id,
      name: form.name.trim(),
      alias: form.alias.trim(),
      regionId: form.regionId,
      status: form.status,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑村" : "新建村"}</DialogTitle>
          <DialogDescription>
            维护自然村 / 行政村的基本资料与区划归属。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="v-name">名称 *</Label>
              <Input
                id="v-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例如:上杭村"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-alias">别名</Label>
              <Input
                id="v-alias"
                value={form.alias}
                onChange={(e) => setForm({ ...form, alias: e.target.value })}
                placeholder="可留空"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="v-region">所属区划</Label>
              <SearchSelect
                value={form.regionId}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    regionId: v ? String(v) : "",
                  })
                }
                options={[
                  { value: "", label: "未指定" },
                  ...regions.map((r) => ({ value: r.id, label: r.name })),
                ]}
                placeholder="选择区划"
                triggerClassName="h-9 w-full"
                inputClassName="h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-status">状态</Label>
              <SearchSelect<string>
                value={String(form.status)}
                onValueChange={(v) =>
                  setForm({ ...form, status: Number(v) as 0 | 1 })
                }
                options={[
                  { value: "1", label: "启用" },
                  { value: "0", label: "禁用" },
                ]}
                placeholder="状态"
                triggerClassName="h-9 w-full"
                inputClassName="h-8"
              />
            </div>
          </div>

          {error && (
            <p className="text-[12.5px] text-danger">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
