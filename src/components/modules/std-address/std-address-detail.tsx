"use client";

import { useEffect } from "react";
import { Eye } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/trpc/react";
import { orEmpty, PLACEHOLDER_EMPTY } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { mapFieldsToPersist } from "@/lib/standardize/persist";
import { STD_ADDRESS_FIELDS } from "./std-address-fields";
import type { StdAddressFieldKey } from "./std-address-fields";
import { StdAddressStandardizeTrace } from "./std-address-standardize-trace";
import type { TraceStep } from "./std-address-standardize-trace";
import type { StdAddressDetail } from "./std-address-form";
import type { StdAddressPreviewDraft } from "./stores/std-address-store";

export function StdAddressDetailDialog({
  open,
  onOpenChange,
  detail,
  draft,
  onAdmit,
  admitPending,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** 已入库记录(查看);新建草稿态时为空 */
  detail: StdAddressDetail | null;
  /** 新建「解析→准入」草稿预览(未入库);有值时以草稿态渲染并显示准入按钮 */
  draft?: StdAddressPreviewDraft | null;
  /** 点击「准入」入库(仅草稿态提供) */
  onAdmit?: () => void;
  /** 准入写入进行中 */
  admitPending?: boolean;
}) {
  // 懒加载:点击「查看标准化流程」才调 ML,避免打开弹窗即触发
  const debugStd = api.stdAddress.standardize.useMutation();

  // 切换记录 / 关闭时清空上次流程结果。
  // 注意:依赖只能放 open / rawAddress,不能放 debugStd 本身(其结果对象每次
  // 状态更新都变身份,放进去会导致每次渲染都 reset,把刚拿到的 trace 清空)
  useEffect(() => {
    debugStd.reset();
  }, [open, detail?.rawAddress, draft?.rawAddress, debugStd.reset]);

  // 视图数据:已入库记录优先,否则用草稿预览
  const view = detail ?? draft ?? null;

  // 取要素值:已入库记录要素为顶层列;草稿要素嵌套在 draft.fields
  function getFieldValue(key: StdAddressFieldKey): string | undefined {
    if (detail) return (detail as Record<string, unknown>)[key] as string | undefined;
    // 草稿要素为 NER 原生键(road_number/sub_lane/group),映射为表列名后按 UI key 读取
    if (draft) {
      return (mapFieldsToPersist(draft.fields) as Record<string, unknown>)[
        key
      ] as string | undefined;
    }
    return undefined;
  }

  // 仅展示有值的地址要素(key → 标签 → 值)
  const filledFields = STD_ADDRESS_FIELDS.filter(([key]) => {
    const v = getFieldValue(key);
    return typeof v === "string" && v.trim() !== "";
  });

  const d = debugStd.data;
  // 推断类型中 ok 为非字面量 boolean,判别收窄失效,按需断言取 trace/error
  const okData = d?.ok ? (d as { trace?: TraceStep[] }) : null;
  // 草稿态解析时已带 trace,直接优先展示;否则用懒加载运行结果
  const traceData = okData?.trace ?? draft?.trace;
  const errorData = d && !d.ok ? (d as { error: string }).error : undefined;
  const isDraft = Boolean(draft);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-xl overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isDraft ? "标准地址预览(待准入)" : "标准地址详情"}
          </DialogTitle>
          <DialogDescription>
            {isDraft
              ? "解析结果预览 · 确认无误后点「准入」入库"
              : "只读视图 · 输入 / 地址要素 / 输出,以及标准化流程(过程)"}
          </DialogDescription>
        </DialogHeader>

        {view ? (
          <div className="space-y-5">
            {/* 输入(原始地址) */}
            <Section title="输入(原始地址)">
              <div className="break-all rounded-xl border border-border bg-secondary/40 px-3 py-2 font-mono text-[13px] text-foreground">
                {view.rawAddress}
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
                      <span className="ml-1">{getFieldValue(key)!}</span>
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
                {orEmpty(view.stdAddress)}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <span className="text-[12px] text-muted-foreground">
                  标准评分
                  <span className="ml-1.5">
                    <ScoreText value={view.stdScore} />
                  </span>
                </span>
                <StatusBadge status={view.status ?? 1} />
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
                    rawAddress: view.rawAddress,
                    debug: true,
                  })
                }
                disabled={debugStd.isPending || !view.rawAddress}
              >
                <Eye className="size-3.5" />
                {debugStd.data ? "重新运行" : "查看标准化流程"}
              </Button>
              <div className="mt-3">
                <StdAddressStandardizeTrace
                  trace={traceData}
                  loading={debugStd.isPending}
                  error={errorData}
                />
              </div>
            </Section>

            {/* 创建/更新时间放最后,见 CLAUDE.md §7(草稿态无时间线) */}
            {detail && (
              <div className="border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
                创建 {formatDateTime(detail.createdAt)} · 更新{" "}
                {formatDateTime(detail.updatedAt)}
              </div>
            )}
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">未选择记录。</p>
        )}

        {/* 草稿态:准入 / 取消 */}
        {isDraft && (
          <DialogFooter className="mt-5">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={admitPending}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={() => onAdmit?.()}
              disabled={admitPending}
            >
              {admitPending ? "准入中…" : "准入"}
            </Button>
          </DialogFooter>
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
