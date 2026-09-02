"use client";

import { useEffect } from "react";
import { Eye } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/trpc/react";
import { orEmpty, PLACEHOLDER_EMPTY } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { STD_ADDRESS_FIELDS } from "./std-address-fields";
import { StdAddressStandardizeTrace } from "./std-address-standardize-trace";
import type { TraceStep } from "./std-address-standardize-trace";
import type { StdAddressDetail } from "./std-address-form";

export function StdAddressDetailDialog({
  open,
  onOpenChange,
  detail,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  detail: StdAddressDetail | null;
}) {
  // 懒加载:点击「查看标准化流程」才调 ML,避免打开弹窗即触发
  const debugStd = api.stdAddress.standardize.useMutation();

  // 切换记录 / 关闭时清空上次流程结果。
  // 注意:依赖只能放 open / rawAddress,不能放 debugStd 本身(其结果对象每次
  // 状态更新都变身份,放进去会导致每次渲染都 reset,把刚拿到的 trace 清空)
  useEffect(() => {
    debugStd.reset();
  }, [open, detail?.rawAddress, debugStd.reset]);

  // 仅展示有值的地址要素(key → 标签 → 值)
  const filledFields = detail
    ? STD_ADDRESS_FIELDS.filter(([key]) => {
        const v = detail[key as keyof StdAddressDetail];
        return typeof v === "string" && v.trim() !== "";
      })
    : [];

  const d = debugStd.data;
  // 推断类型中 ok 为非字面量 boolean,判别收窄失效,按需断言取 trace/log
  const okData = d?.ok ? (d as { trace?: TraceStep[]; log?: string[] }) : null;
  const traceData = okData?.trace;
  const logData = okData?.log;
  const errorData = d && !d.ok ? (d as { error: string }).error : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-xl overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>标准地址详情</DialogTitle>
          <DialogDescription>
            只读视图 · 输入 / 地址要素 / 输出,以及标准化流程(过程)
          </DialogDescription>
        </DialogHeader>

        {detail ? (
          <div className="space-y-5">
            {/* 输入(原始地址) */}
            <Section title="输入(原始地址)">
              <div className="break-all rounded-xl border border-border bg-secondary/40 px-3 py-2 font-mono text-[13px] text-foreground">
                {detail.rawAddress}
              </div>
            </Section>

            {/* 地址要素:有值的以 tag 形式展示 */}
            <Section title={`地址要素(有值 ${filledFields.length} / 27)`}>
              {filledFields.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {filledFields.map(([key, label]) => (
                    <Badge
                      key={key}
                      variant="secondary"
                      className="text-[11px] font-normal"
                    >
                      <span className="text-muted-foreground">{label}:</span>
                      <span className="ml-1">
                        {detail[key as keyof StdAddressDetail] as string}
                      </span>
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] text-muted-foreground">无要素</p>
              )}
            </Section>

            {/* 输出(标准地址) */}
            <Section title="输出(标准地址)">
              <div className="break-all rounded-xl border border-border bg-primary/5 px-3 py-2 font-mono text-[13px] text-foreground">
                {orEmpty(detail.stdAddress)}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <span className="text-[12px] text-muted-foreground">
                  标准评分
                  <span className="ml-1.5">
                    <ScoreText value={detail.stdScore} />
                  </span>
                </span>
                <StatusBadge status={detail.status} />
              </div>
            </Section>

            {/* 标准化流程(过程) */}
            <Section title="标准化流程(过程)">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  debugStd.mutate({
                    rawAddress: detail.rawAddress,
                    debug: true,
                  })
                }
                disabled={debugStd.isPending || !detail.rawAddress}
              >
                <Eye className="size-3.5" />
                {debugStd.data ? "重新运行" : "查看标准化流程"}
              </Button>
              <div className="mt-3">
                <StdAddressStandardizeTrace
                  trace={traceData}
                  log={logData}
                  loading={debugStd.isPending}
                  error={errorData}
                />
              </div>
            </Section>

            {/* 创建/更新时间放最后,见 CLAUDE.md §7 */}
            <div className="border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
              创建 {formatDateTime(detail.createdAt)} · 更新{" "}
              {formatDateTime(detail.updatedAt)}
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">未选择记录。</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** 分区标题 + 内容 */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-[12px] font-medium text-muted-foreground">{title}</h4>
      {children}
    </div>
  );
}

/** 评分:Decimal 序列化后可能是 string/number,null 显示占位 */
function ScoreText({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") {
    return <span className="font-mono text-muted-foreground">{PLACEHOLDER_EMPTY}</span>;
  }
  const n = Number(value);
  if (Number.isNaN(n)) {
    return <span className="font-mono text-muted-foreground">{PLACEHOLDER_EMPTY}</span>;
  }
  return <span className="font-mono">{n.toFixed(1)}</span>;
}
