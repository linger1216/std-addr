"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Blocks,
  Bot,
  CheckCircle2,
  Loader2,
  Play,
  PlugZap,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { Reveal } from "@/components/ui/reveal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { api } from "@/trpc/react";
import { FIELD_KEY_TO_ZH } from "@/lib/addr-model/fields";
import { buildAnnotations, toText, type Annotation } from "@/lib/addr-model/annotations";
import { AddrModelBatchDemo } from "./addr-model-batch-demo";

/** 27 个地址要素的展示色板(循环取色,与标注可视化一致) */
const ENTITY_COLORS = [
  "bg-primary/10 text-primary border-primary/30",
  "bg-success-soft text-success-fg border-success/30",
  "bg-warn-soft text-warn-fg border-warn/30",
  "bg-danger-soft text-danger border-danger/30",
  "bg-secondary text-foreground border-border",
];

function entityColor(idx: number): string {
  return ENTITY_COLORS[idx % ENTITY_COLORS.length]!;
}

/** 示例地址(点按填入输入框;注意去重,chips 以地址为 key) */
const EXAMPLES = [
  "闵行区七宝镇航华二村三街坊169号楼403室（驰骋小区）",
  "上海市浦东新区川沙路跃进村三组",
  "上海市新市路1500号",
  "闵行区华茂路32弄17号",
];

/**
 * 地址模型 · 能力门户
 * 定位:展示地址模型(分词 → 27 要素识别 → 标准结构化)能力。
 * 单条解析演示采用"地址拆解舞台":解析后原文实体片段错落剥离、
 * 结构化字段逐条渐入,直观呈现模型如何拆解地址。
 */
export function AddrModelPage() {
  const { data: settings } = api.settings.get.useQuery();
  const modelUrl = useMemo(() => {
    const v = settings?.["model.serviceUrl"];
    return typeof v === "string" && v ? v : "http://localhost:8000";
  }, [settings]);

  // —— 模型健康状态 ——
  const [health, setHealth] = useState<{
    ok: boolean;
    latencyMs?: number;
    error?: string;
  } | null>(null);

  const healthQuery = api.addrModel.health.useQuery(undefined, {
    retry: false,
  });
  useEffect(() => {
    if (healthQuery.isError) {
      setHealth({ ok: false, error: "模型服务不可达" });
    } else if (healthQuery.isSuccess) {
      setHealth({
        ok: healthQuery.data.ok,
        latencyMs: healthQuery.data.latencyMs,
        error: healthQuery.data.error,
      });
    }
  }, [healthQuery.isError, healthQuery.isSuccess, healthQuery.data]);

  // —— 单条解析演示 ——
  const [address, setAddress] = useState(EXAMPLES[0]!);
  const parseQuery = api.addrModel.parse.useQuery(
    { address: address.trim() || " " },
    { enabled: false, retry: false },
  );
  const parseResult = parseQuery.data ?? null;

  /** 解析版本号:每次触发解析 +1,用于 动画重放 key */
  const [parseVersion, setParseVersion] = useState(0);

  /** 结构化字段数(标注可视化应与右侧一致) */
  const structureFieldCount = parseResult
    ? Object.entries(parseResult).filter(
      ([k, v]) =>
        !["entities", "address"].includes(k) && v != null && toText(v) !== "",
    ).length
    : 0;

  // 解析失败提示(useQuery 无 mutation onError,用 effect 兜底)
  useEffect(() => {
    if (parseQuery.isError) {
      setParseVersion((v) => v + 1); // 让旧结果退出动画
      toast.error(parseQuery.error.message);
    }
  }, [parseQuery.isError, parseQuery.error]);

  // 解析结果 → 标注可视化分片(字段值反查原文位置)
  const annotations = useMemo(() => {
    if (!parseResult) return [];
    return buildAnnotations(address, parseResult);
  }, [parseResult, address]);

  const offline = health ? !health.ok : false;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        title="地址模型"
        description="模型能力门户:展示地址分词、27 要素识别与标准结构化输出,输入真实地址即可体验"
        actions={
          <Badge
            variant="outline"
            className={cn(
              "gap-1 px-2.5 py-1",
              offline
                ? "border-danger/40 text-danger"
                : "border-success/40 text-success-fg",
            )}
          >
            {offline ? (
              <XCircle className="size-3.5" />
            ) : (
              <CheckCircle2 className="size-3.5" />
            )}
            {offline
              ? "模型离线"
              : `模型在线${health?.latencyMs != null ? `(${health.latencyMs}ms)` : ""}`}
            <span className="ml-1 text-[10px] opacity-70">{modelUrl}</span>
          </Badge>
        }
      />

      {/* ① 能力概览条 */}
      <Reveal className="shrink-0">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "支持要素", value: "27", Icon: Blocks, desc: "地址要素字典(BIO 标注)" },
            { label: "解析接口", value: "3", Icon: PlugZap, desc: "health / format / batch" },
            { label: "批量上限", value: "100", Icon: Bot, desc: "单次批量解析条数" },
            { label: "结构化输出", value: "✓", Icon: Sparkles, desc: "要素 → 标准字段映射" },
          ].map(({ label, value, Icon, desc }) => (
            <Card key={label} size="sm" className="p-4">
              <CardHeader className="p-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {label}
                  </CardTitle>
                  <div className="flex size-8 items-center justify-center rounded-lg bg-secondary">
                    <Icon className="size-4 text-foreground" />
                  </div>
                </div>
                <div className="text-[24px] font-semibold leading-none">{value}</div>
              </CardHeader>
              <CardContent className="p-0 pt-2">
                <span className="text-[11px] text-muted-foreground">{desc}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      </Reveal>

      {/* ② 单条解析演示 —— 地址拆解舞台(合并大卡) */}
      <Reveal delay={60} className="shrink-0">
        <Card className="overflow-hidden p-0">
          {/* 卡片头 */}
          <CardHeader className="border-b border-border/60 px-5 pt-4 pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>单条解析 · 地址拆解</CardTitle>
              <div className="flex flex-wrap items-center gap-1.5">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setAddress(ex)}
                    className="rounded-lg border border-border px-2 py-0.5 text-[11.5px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {ex}
                  </button>
                ))}
              </div>
              <div className="text-[12.5px] text-muted-foreground">
                模型对地址执行 BIO 序列标注, 识别并输出以下 27 个地址要素:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "路号", "组", "巷", "楼层", "城市", "街道", "楼栋", "快速路", "弄", "兴趣点",
                  "镇", "位置类型", "支弄", "宅", "子区域", "单元", "室号", "队", "其他", "乡",
                  "路", "方向", "村", "小区", "省份", "高速公路", "区县",
                ].map((label, i) => (
                  <Badge
                    key={label}
                    variant="outline"
                    className={cn(
                      "cursor-default px-2 py-0.5 text-[11.5px]",
                      entityColor(i),
                    )}
                  >
                    {label}
                  </Badge>
                ))}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-3">
            {/* 输入行 */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="输入要解析的地址,如:闵行区华茂路32弄17号"
                  className="h-10 w-full bg-muted/30 pr-8 font-mono text-[13.5px]"
                />
                <AnimatePresence>
                  {address && (
                    <motion.button
                      type="button"
                      aria-label="清空输入"
                      title="清空输入"
                      onClick={() => setAddress("")}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.12 }}
                      className="absolute top-1/2 right-2.5 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  if (!address.trim()) return;
                  setParseVersion((v) => v + 1);
                  void parseQuery.refetch();
                }}
                disabled={!address.trim() || parseQuery.isFetching || offline}
                className="h-10 px-5"
              >
                {parseQuery.isFetching ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
                解析
              </Button>
            </div>
            {offline && (
              <p className="mt-2 text-[12px] text-danger">
                模型服务离线,请先在「系统管理 → 系统设置 → 模型设置」配置服务地址。
              </p>
            )}

            {/* 拆解舞台:原文(左)+ 结构化字段(右) */}
            <AnimatePresence mode="wait">
              {parseResult && (
                <motion.div
                  key={`${parseVersion}-${address}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="mt-4 grid gap-0 overflow-hidden rounded-xl border border-border md:grid-cols-5"
                >
                  {/* 左:原文拆解 */}
                  <div className="relative border-b border-border bg-muted/20 p-4 md:col-span-3 md:border-r md:border-b-0">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        原文拆解
                      </span>
                      <span className="text-[11px] tabular-nums text-muted-foreground/70">
                        {structureFieldCount} 个要素
                      </span>
                    </div>

                    {/* 地址原文:实体片段错落剥离(按位置精确切片) */}
                    <div className="text-[15px] leading-relaxed">
                      {annotations.some((a) => a.matched) ? (
                        renderAnnotated(address, annotations)
                      ) : (
                        <span className="font-mono text-muted-foreground/70">
                          {address}
                        </span>
                      )}
                    </div>

                    {/* 未精确匹配的字段(模型输出与原文写法不同,降级展示) */}
                    {annotations.filter((a) => !a.matched).length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {annotations
                          .filter((a) => !a.matched)
                          .map((a, i) => (
                            <span
                              key={`un-${parseVersion}-${i}`}
                              className="rounded-md border border-dashed border-warn/50 bg-warn-soft px-1.5 py-0.5 font-mono text-[11px] text-warn-fg"
                              title="该字段在原文中未精确匹配(模型合并/改写)"
                            >
                              {a.label}≈{a.text}
                            </span>
                          ))}
                      </div>
                    )}

                    {/* 拆解轨道:要素计数与结构化字段一致 */}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {[...new Set(annotations.map((a) => a.label))].map(
                        (label, i) => (
                          <motion.span
                            key={`tag-${parseVersion}-${i}`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.2 + i * 0.07 }}
                            className="rounded-md border px-1.5 py-0.5 text-[10.5px] text-muted-foreground"
                          >
                            {label}
                          </motion.span>
                        ),
                      )}
                    </div>
                  </div>

                  {/* 右:结构化字段 */}
                  <div className="p-4 md:col-span-2">
                    <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      结构化字段
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {Object.entries(parseResult)
                        .filter(
                          ([k, v]) =>
                            !["entities", "address"].includes(k) &&
                            v != null &&
                            v !== "",
                        )
                        .map(([k, v], i) => (
                          <motion.div
                            key={`${parseVersion}-${k}`}
                            initial={{ opacity: 0, x: 12 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.15 + i * 0.06 }}
                            className="flex items-center justify-between gap-2 rounded-lg bg-card px-3 py-1.5 shadow-sm"
                          >
                            <span className="text-[12px] text-muted-foreground">
                              {FIELD_KEY_TO_ZH[k] ?? k}
                            </span>
                            <span className="truncate text-[13px] font-medium tabular-nums">
                              {String(v)}
                            </span>
                          </motion.div>
                        ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </Reveal>

      {/* ③ 批量解析演示 */}
      <Reveal delay={120} className="shrink-0">
        <Card className="p-5">
          <CardHeader className="p-0">
            <CardTitle>批量解析演示</CardTitle>
          </CardHeader>
          <CardContent className="mt-4 p-0">
            <AddrModelBatchDemo offline={offline} />
          </CardContent>
        </Card>
      </Reveal>
    </div>
  );
}


function renderAnnotated(full: string, annotations: Annotation[]) {
  const matched = annotations.filter((a) => a.matched);
  if (matched.length === 0) return full;
  // 同要素多段共用同一颜色:按要素首次出现顺序取色
  const labelOrder = [...new Set(matched.map((a) => a.label))];
  const colorOf = (label: string) => entityColor(labelOrder.indexOf(label));
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  matched.forEach((a, i) => {
    const start = a.start ?? 0;
    const end = a.end ?? start;
    if (start > cursor) nodes.push(full.slice(cursor, start));
    nodes.push(
      <mark
        key={i}
        className={cn(
          "mr-1.5 mb-1 inline-flex items-center rounded-md border px-2 font-mono tabular-nums align-middle",
          colorOf(a.label),
        )}
        title={`${a.label}: ${full.slice(start, end) || a.text}`}
      >
        <span className="mr-1 text-[9.5px] font-medium opacity-80">{a.label}</span>
        {full.slice(start, end) || a.text}
      </mark>,
    );
    cursor = Math.max(cursor, end);
  });
  if (cursor < full.length) nodes.push(full.slice(cursor));
  return nodes;
}
