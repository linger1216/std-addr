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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { RegionOption } from "@/components/modules/village/village-toolbar";

export type VillageFormValues = {
  id?: string | null;
  name: string;
  alias: string;
  regionId: string;
  status: 0 | 1;
  geom: string;
};

export type VillageDetail = {
  id: string;
  name: string;
  alias: string | null;
  regionId: string | null;
  status: number;
  geom: unknown;
  createdAt: Date;
  updatedAt: Date;
};

const EMPTY: VillageFormValues = {
  id: null,
  name: "",
  alias: "",
  regionId: "",
  status: 1,
  geom: "",
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
          geom: initial.geom ? JSON.stringify(initial.geom, null, 2) : "",
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
    if (form.geom.trim()) {
      try {
        JSON.parse(form.geom);
      } catch (err) {
        setError(
          `geom 不是合法 JSON: ${err instanceof Error ? err.message : String(err)}`,
        );
        return;
      }
    }
    onSubmit({
      id: form.id,
      name: form.name.trim(),
      alias: form.alias.trim(),
      regionId: form.regionId,
      status: form.status,
      geom: form.geom,
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
              <Select
                value={form.regionId || "_none"}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    regionId: v && v !== "_none" ? String(v) : "",
                  })
                }
              >
                <SelectTrigger id="v-region" className="h-9">
                  <SelectValue placeholder="选择区划" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">未指定</SelectItem>
                  {regions.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-status">状态</Label>
              <Select
                value={String(form.status)}
                onValueChange={(v) =>
                  setForm({ ...form, status: Number(v) as 0 | 1 })
                }
              >
                <SelectTrigger id="v-status" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">启用</SelectItem>
                  <SelectItem value="0">禁用</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="v-geom">geom (JSON 字符串)</Label>
            <Textarea
              id="v-geom"
              value={form.geom}
              onChange={(e) => setForm({ ...form, geom: e.target.value })}
              placeholder='例如:{"type":"Polygon","coordinates":[[[116.3,39.8],[116.4,39.8],[116.4,39.9],[116.3,39.9],[116.3,39.8]]]}'
              className="min-h-20 font-mono text-[12px]"
            />
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