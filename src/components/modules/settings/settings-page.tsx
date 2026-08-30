"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, PlugZap, Save, Settings, XCircle } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { Reveal } from "@/components/ui/reveal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { api } from "@/trpc/react";

/**
 * 系统设置页:
 *  - Tab「系统设置」:系统名称 / 系统描述(持久化 sys_setting)
 *  - Tab「模型设置」:模型服务 URL(API 端口)+ 测试连接
 */
export function SettingsPage() {
  const { data: settings, refetch } = api.settings.get.useQuery();

  // —— 系统设置 tab 表单 ——
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  // —— 模型设置 tab 表单 ——
  const [modelUrl, setModelUrl] = useState("http://localhost:8000");
  const [health, setHealth] = useState<{
    ok: boolean;
    latencyMs?: number;
    error?: string;
    url?: string;
  } | null>(null);
  const [testing, setTesting] = useState(false);

  const [tab, setTab] = useState<"system" | "model">("system");

  const utils = api.useUtils();
  const updateMutation = api.settings.update.useMutation({
    onSuccess: () => {
      toast.success("设置已保存");
      void refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  // 设置加载后回填表单
  useEffect(() => {
    if (!settings) return;
    setName(toText(settings["sys.name"]));
    setDescription(toText(settings["sys.description"]));
    setModelUrl(toText(settings["model.serviceUrl"]) || "http://localhost:8000");
  }, [settings]);

  function handleSaveSystem() {
    updateMutation.mutate({
      updates: [
        { key: "sys.name", value: name.trim() || "std-addr" },
        { key: "sys.description", value: description.trim() },
      ],
    });
  }

  function handleSaveModel() {
    updateMutation.mutate({
      updates: [{ key: "model.serviceUrl", value: modelUrl.trim() || "http://localhost:8000" }],
    });
  }

  async function handleTest() {
    if (!modelUrl.trim()) {
      toast.error("请先填写模型服务地址");
      return;
    }
    setTesting(true);
    setHealth(null);
    try {
      // 保存后再测试,保证测试用的就是表单里的地址
      await updateMutation.mutateAsync({
        updates: [{ key: "model.serviceUrl", value: modelUrl.trim() || "http://localhost:8000" }],
      });
      const result = await utils.settings.modelTest.fetch();
      setHealth(result);
    } catch (err) {
      setHealth({ ok: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setTesting(false);
    }
  }

  const isSaving = updateMutation.isPending;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        title="系统设置"
        description="系统本身设置与地址解析模型服务配置"
      />

      {/* Tab 切换 */}
      <div className="flex shrink-0 items-center gap-1">
        {(
          [
            ["system", "系统设置", Settings],
            ["model", "模型设置", PlugZap],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[13px] transition-colors",
              tab === key
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === "system" ? (
        <Reveal className="shrink-0">
          <Card className="max-w-xl p-5">
            <CardHeader className="p-0">
              <CardTitle>系统设置</CardTitle>
            </CardHeader>
            <CardContent className="mt-4 space-y-4 p-0">
              <div className="flex flex-col gap-1.5">
                <Label className="text-[12px] text-muted-foreground">系统名称</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="std-addr"
                  className="h-9 text-[13px]"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-[12px] text-muted-foreground">系统描述</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="面向地址数据管理与模型能力演示的平台"
                  rows={3}
                  className="text-[13px]"
                />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" onClick={handleSaveSystem} disabled={isSaving}>
                  <Save className="size-3.5" />
                  {isSaving ? "保存中…" : "保存"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </Reveal>
      ) : (
        <Reveal className="shrink-0">
          <Card className="max-w-xl p-5">
            <CardHeader className="p-0">
              <CardTitle>模型设置</CardTitle>
            </CardHeader>
            <CardContent className="mt-4 space-y-4 p-0">
              <div className="flex flex-col gap-1.5">
                <Label className="text-[12px] text-muted-foreground">
                  模型服务地址(API 端口)
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={modelUrl}
                    onChange={(e) => setModelUrl(e.target.value)}
                    placeholder="http://localhost:8000"
                    className="h-9 flex-1 text-[13px]"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleTest}
                    disabled={testing}
                  >
                    {testing ? "测试中…" : "测试连接"}
                  </Button>
                  <Button size="sm" onClick={handleSaveModel} disabled={isSaving}>
                    <Save className="size-3.5" />
                    保存
                  </Button>
                </div>
                <p className="text-[11.5px] text-muted-foreground">
                  地址解析模型(NER)服务端口,修改后「地址模型」页立即使用新地址。
                </p>
              </div>

              {/* 连通性结果 */}
              {health && (
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[12.5px]",
                    health.ok
                      ? "border-success/30 bg-success-soft text-success-fg"
                      : "border-danger/30 bg-danger-soft text-danger",
                  )}
                >
                  {health.ok ? (
                    <CheckCircle2 className="size-4 shrink-0" />
                  ) : (
                    <XCircle className="size-4 shrink-0" />
                  )}
                  <span className="flex-1">
                    {health.ok
                      ? `模型服务在线(${health.latencyMs ?? "-"}ms)`
                      : `模型服务离线:${health.error ?? "未知原因"}`}
                  </span>
                  {health.url && (
                    <span className="text-[11px] opacity-70">{health.url}</span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </Reveal>
      )}
    </div>
  );
}

/** unknown → 可展示字符串(仅 string/number/boolean;其它返回空串) */
function toText(v: unknown): string {
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return String(v);
  }
  return "";
}
