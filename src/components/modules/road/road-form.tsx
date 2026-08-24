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

export type RoadFormValues = {
  id?: string | null;
  road: string;
  status: 0 | 1;
};

export type RoadDetail = {
  id: string;
  road: string;
  status: number;
  createdAt: Date | null;
  updatedAt: Date | null;
};

const EMPTY: RoadFormValues = {
  id: null,
  road: "",
  status: 1,
};

export function RoadFormDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  initial: RoadDetail | RoadFormValues | null;
  onSubmit: (values: RoadFormValues) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState<RoadFormValues>(EMPTY);
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
          road: initial.road,
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
    if (!form.road.trim()) {
      setError("请输入道路名");
      return;
    }
    onSubmit({
      id: form.id,
      road: form.road.trim(),
      status: form.status,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑道路" : "新建道路"}</DialogTitle>
          <DialogDescription>
            维护道路名称与启停状态。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="r-road">道路名 *</Label>
            <Input
              id="r-road"
              value={form.road}
              onChange={(e) => setForm({ ...form, road: e.target.value })}
              placeholder="例如:中山大道"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="r-status">状态</Label>
            <Select
              value={String(form.status)}
              items={[
                { value: "1", label: "启用" },
                { value: "0", label: "禁用" },
              ]}
              onValueChange={(v) =>
                setForm({ ...form, status: Number(v) as 0 | 1 })
              }
            >
              <SelectTrigger id="r-status" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">启用</SelectItem>
                <SelectItem value="0">禁用</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-[12.5px] text-danger">{error}</p>}
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