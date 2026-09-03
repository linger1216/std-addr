"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/trpc/react";
import { toApiError } from "@/lib/api/error";
import { toast } from "sonner";
import type { StdAddressPreviewDraft } from "./stores/std-address-store";

/**
 * 新建「解析」弹窗(流程第 1 步)。
 *
 * 只收原始地址 → 调 standardize(debug:true) → 解析成功后把结果作为草稿
 * 交给 onParsed,由详情弹窗以草稿态展示,用户点「准入」才真正入库。
 */
export function StdAddressParseDialog({
  open,
  onOpenChange,
  onParsed,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onParsed: (draft: StdAddressPreviewDraft) => void;
}) {
  const [rawAddress, setRawAddress] = useState("");

  const parseMut = api.stdAddress.standardize.useMutation({
    onSuccess: (res) => {
      // ok 为非字面量 boolean,判别收窄失效,按需断言取成功分支
      if (!res.ok) {
        toast.error((res as { error: string }).error);
        return;
      }
      const data = res as StdAddressPreviewDraft;
      onParsed({
        rawAddress: data.rawAddress,
        stdAddress: data.stdAddress ?? null,
        stdScore: data.stdScore,
        fields: data.fields,
        status: 1,
        trace: data.trace,
      });
      onOpenChange(false);
    },
    onError: (e) => toast.error(toApiError(e).message),
  });

  // 打开时清空上一次输入
  useEffect(() => {
    if (open) setRawAddress("闵行区七宝镇万泰小区16号楼403室");
  }, [open]);

  function handleParse() {
    const value = rawAddress.trim();
    if (!value) {
      toast.error("请输入原始地址");
      return;
    }
    parseMut.mutate({ rawAddress: value, debug: true });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>新建标准地址</DialogTitle>
          <DialogDescription>
            输入原始地址,点击解析后系统自动标准化并展示结果;确认无误后点「准入」入库。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Textarea
            value={rawAddress}
            onChange={(e) => setRawAddress(e.target.value)}
            placeholder="例如:永跃路260弄38号502室"
            rows={3}
            disabled={parseMut.isPending}
          />
          <p className="text-[11px] text-muted-foreground">
            仅原始地址参与解析,标准地址与 27 要素由标准化引擎生成。
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={parseMut.isPending}
          >
            取消
          </Button>
          <Button
            type="button"
            onClick={handleParse}
            disabled={parseMut.isPending || rawAddress.trim() === ""}
          >
            <Sparkles className="size-3.5" />
            {parseMut.isPending ? "解析中…" : "解析"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
