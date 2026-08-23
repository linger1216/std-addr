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
import type { RegionOption } from "@/components/modules/community/community-toolbar";

export type CommunityFormValues = {
  id?: string | null;
  name: string;
  alias: string;
  regionId: string;
  status: 0 | 1;
  address: string; // JSON 文本,提交时尝试解析
  geom: string;
};

export type CommunityDetail = {
  id: string;
  name: string;
  alias: string | null;
  regionId: string | null;
  status: number;
  address: unknown;
  geom: unknown;
  createdAt: Date;
  updatedAt: Date;
};

const EMPTY: CommunityFormValues = {
  id: null,
  name: "",
  alias: "",
  regionId: "",
  status: 1,
  address: "",
  geom: "",
};

export function CommunityFormDialog({
  open,
  onOpenChange,
  initial,
  regions,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  initial: CommunityDetail | CommunityFormValues | null;
  regions: RegionOption[];
  onSubmit: (values: CommunityFormValues) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState<CommunityFormValues>(EMPTY);
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
      setError("请输入小区名称");
      return;
    }
    // 简单本地校验:非空 JSON 字段必须能解析
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
          <DialogTitle>{isEdit ? "编辑小区" : "新建小区"}</DialogTitle>
          <DialogDescription>
            维护住宅小区的基本资料与区划归属。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="c-name">名称 *</Label>
              <Input
                id="c-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例如:阳光花园"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-alias">别名</Label>
              <Input
                id="c-alias"
                value={form.alias}
                onChange={(e) => setForm({ ...form, alias: e.target.value })}
                placeholder="可留空"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="c-region">所属区划</Label>
              <Select
                value={form.regionId || "_none"}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    regionId: v && v !== "_none" ? String(v) : "",
                  })
                }
              >
                <SelectTrigger id="c-region" className="h-9">
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
              <Label htmlFor="c-status">状态</Label>
              <Select
                value={String(form.status)}
                onValueChange={(v) =>
                  setForm({ ...form, status: (Number(v) as 0 | 1) })
                }
              >
                <SelectTrigger id="c-status" className="h-9">
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
            <Label htmlFor="c-address">address (JSON 字符串)</Label>
            <Textarea
              id="c-address"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder='例如:{"province":"北京","city":"北京","district":"朝阳区"}'
              className="min-h-20 font-mono text-[12px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="c-geom">geom (JSON 字符串)</Label>
            <Textarea
              id="c-geom"
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
