"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * 通用确认 Dialog —— 单条/批量删除等"危险操作确认"场景复用。
 * page/模块里不再重复写 Dialog 样板。
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "删除",
  isPending = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  confirmText?: string;
  isPending?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onOpenChange(false);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isPending}
            className="bg-danger text-white hover:bg-danger/90"
          >
            {isPending ? "删除中…" : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}