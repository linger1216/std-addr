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
import type { RegionOption } from "@/components/modules/poi/poi-toolbar";

export type PoiFormValues = {
  id?: string | null;
  name: string;
  type: string;
  alias: string;
  regionId: string;
  status: 0 | 1;
  address: string; // JSON 文本,提交时尝试解析
  geom: string;
};

export type PoiDetail = {
  id: string;
  name: string;
  type: string | null;
  alias: string | null;
  regionId: string | null;
  status: number;
  address: unknown;
  geom: unknown;
  createdAt: Date;
  updatedAt: Date;
};

const EMPTY: PoiFormValues = {
  id: null,
  name: "",
  type: "",
  alias: "",
  regionId: "",
  status: 1,
  address: "",
  geom: "",
};

export function PoiFormDialog({
  open,
  onOpenChange,
  initial,
  regions,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  initial: PoiDetail | PoiFormValues | null;
  regions: RegionOption[];
  onSubmit: (values: PoiFormValues) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState<PoiFormValues>(EMPTY);
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
          type: initial.type ?? "",
          alias: initial.alias ?? "",
          regionId: initial.regionId ?? "",
          status: initial.status === 0 ? 0 : 1,
          address: initial.address ? JSON.stringify(initial.address, null, 2) : "",
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
      setError("请输入 POI 名称");
      return;
    }
    if (form.address.trim()) {
      try {
        JSON.parse(form.address);
      } catch (err) {
        setError(
          `address 不是合法 JSON: ${err instanceof Error ? err.message : String(err)}`,
        );
        return;
      }
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
      type: form.type.trim(),
      alias: form.alias.trim(),
      regionId: form.regionId,
      status: form.status,
      address: form.address,
      geom: form.geom,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑 POI" : "新建 POI"}</DialogTitle>
          <DialogDescription>
            维护兴趣点的名称、分类与坐标信息。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="p-name">名称 *</Label>
              <Input
                id="p-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例如:市第一人民医院"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-type">类型</Label>
              <Input
                id="p-type"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                placeholder="例如:医院"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="p-alias">别名</Label>
              <Input
                id="p-alias"
                value={form.alias}
                onChange={(e) => setForm({ ...form, alias: e.target.value })}
                placeholder="可留空"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-region">所属区划</Label>
              <Select
                value={form.regionId || "_none"}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    regionId: v && v !== "_none" ? String(v) : "",
                  })
                }
              >
                <SelectTrigger id="p-region" className="h-9">
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
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="p-status">状态</Label>
            <Select
              value={String(form.status)}
              onValueChange={(v) =>
                setForm({ ...form, status: Number(v) as 0 | 1 })
              }
            >
              <SelectTrigger id="p-status" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">启用</SelectItem>
                <SelectItem value="0">禁用</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="p-address">address (JSON 字符串)</Label>
            <Textarea
              id="p-address"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder='例如:{"province":"北京","city":"北京","district":"朝阳区","street":"XX路"}'
              className="min-h-20 font-mono text-[12px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="p-geom">geom (JSON 字符串)</Label>
            <Textarea
              id="p-geom"
              value={form.geom}
              onChange={(e) => setForm({ ...form, geom: e.target.value })}
              placeholder='例如:{"type":"Point","coordinates":[116.4,39.9]}'
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