"use client";

import { useMemo } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Check, Plus, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  addrSimRuleSchema,
  type AddrSimLabel,
  type AddrSimStep,
} from "@/lib/validators/addr-sim";
import {
  generateAddress,
  type CandidatePool,
} from "@/lib/addr-sim/generator";
import { resolveStepWithLabel } from "@/lib/addr-sim/resolve-step";
import { useAddrSimActions, useAddrSimRuleState } from "./stores/addr-sim-store";
import { StepEmptyHint, StepRow } from "./addr-sim-step-row";

export interface AddrSimRuleRow {
  id: string;
  name: string;
  steps: AddrSimStep[];
  /** 实际占比 1~100(可空 = 未设置) */
  radio?: number | null;
  /** 规则样本数(导入时写入;手动创建 = null) */
  count?: number | null;
  /** 总样本数(所属导入文件总记录数) */
  total?: number | null;
  /** 状态:1 启用 / 0 禁用 */
  status?: 0 | 1;
  updatedAt?: string | null;
}

/**
 * 规则编辑器(卡片式):
 *  - 名称输入 + 保存/取消(保存走父级 mutation)
 *  - 步骤列表:DndContext 拖拽排序 + 添加/删除 + 单步预览
 *  - 底部整条规则预览(按顺序拼接 + 字段名[值]标注)
 *
 * P0-6:labels 接收 AddrSimLabel[] 含 data/prefix/suffix;预览前先 resolve。
 */
export function AddrSimRuleEditor({
  labels,
  candidates,
  isPending,
  onSave,
  onSaveToElement,
}: {
  labels: AddrSimLabel[];
  candidates: CandidatePool;
  isPending: boolean;
  /** 保存回调:传入名称 + 步骤数组,由父级决定 create/update */
  onSave: (payload: { name: string; steps: AddrSimStep[] }) => void;
  /**
   * "保存到要素"回调:把当前步骤的生效配置写回地址要素默认,
   * 使所有引用该要素的步骤都继承这份默认。
   */
  onSaveToElement?: (step: AddrSimStep) => void;
}) {
  const { editingId, editingName, editingRadio, editingStatus, draftSteps } =
    useAddrSimRuleState();
  const actions = useAddrSimActions();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const stepIds = useMemo(() => draftSteps.map((d) => d.id), [draftSteps]);
  const labelMap = useMemo(() => {
    const m = new Map<string, AddrSimLabel>();
    for (const l of labels) m.set(l.name, l);
    return m;
  }, [labels]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = draftSteps.findIndex((d) => d.id === active.id);
    const to = draftSteps.findIndex((d) => d.id === over.id);
    if (from < 0 || to < 0) return;
    actions.moveStep(from, to);
  }

  function updateStepById(id: string, step: AddrSimStep) {
    actions.updateStep(id, step);
  }

  function handleSave() {
    const steps = draftSteps.map((d) => d.step);
    if (!editingName.trim()) {
      toast.error("请先填写规则名称");
      return;
    }
    const parsed = addrSimRuleSchema.safeParse({
      name: editingName,
      steps,
      radio: editingRadio,
      status: editingStatus,
    });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      toast.error(first?.message ?? "规则配置不合法");
      return;
    }
    onSave(parsed.data);
  }

  // 整条规则预览:实时重算 3 条(响应配置变化)
  const rulePreview = useMemo(() => {
    if (draftSteps.length === 0) return [];
    const rows: Array<{ address: string; parts: Array<{ label: string; value: string }> }> = [];
    for (let i = 0; i < 3; i++) {
      const resolvedSteps = draftSteps.map((d) =>
        resolveStepWithLabel(d.step, labelMap.get(d.step.name) ?? null),
      );
      const { address, result } = generateAddress(resolvedSteps, {
        rng: Math.random,
        candidates,
        realNames: Object.values(candidates).flat(),
      });
      rows.push({
        address,
        parts: result.map((r) => ({ label: r.value.labels[0]!, value: r.value.text })),
      });
    }
    return rows;
  }, [draftSteps, candidates, labelMap]);

  return (
    <div className="flex flex-col gap-3">
      {/* 名称 + 操作 */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={editingName}
          onChange={(e) => actions.setEditingName(e.target.value)}
          placeholder="规则名称(必填)…"
          className="h-8 w-64 text-[13px]"
        />
        <div className="flex items-center gap-1.5">
          <span className="text-[11.5px] text-muted-foreground">占比</span>
          <Input
            type="number"
            value={editingRadio ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                actions.setEditingRadio(null);
                return;
              }
              const n = Number(raw);
              if (Number.isNaN(n)) return;
              actions.setEditingRadio(Math.max(1, Math.min(100, Math.round(n))));
            }}
            placeholder="未设置"
            min={1}
            max={100}
            className="h-8 w-20 px-2 text-[13px] tabular-nums"
            title="占比 1~100,生成时作为该规则初始化比例"
          />
          <span className="text-[11.5px] text-muted-foreground">%</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[11.5px] text-muted-foreground">状态</span>
          <div className="flex overflow-hidden rounded-lg border border-border">
            <button
              type="button"
              onClick={() => actions.setEditingStatus(1)}
              className={cn(
                "px-2 py-1 text-[11.5px] transition-colors",
                editingStatus === 1
                  ? "bg-success text-white"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              启用
            </button>
            <button
              type="button"
              onClick={() => actions.setEditingStatus(0)}
              className={cn(
                "border-l border-border px-2 py-1 text-[11.5px] transition-colors",
                editingStatus === 0
                  ? "bg-danger text-white"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              禁用
            </button>
          </div>
        </div>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="outline"
          onClick={actions.closeEditor}
          disabled={isPending}
        >
          <X className="size-3.5" />
          取消
        </Button>
        <Button size="sm" onClick={handleSave} disabled={isPending}>
          <Check className="size-3.5" />
          {isPending ? "保存中…" : editingId ? "保存修改" : "创建规则"}
        </Button>
      </div>

      {/* 步骤列表(拖拽排序) */}
      {draftSteps.length === 0 ? (
        <StepEmptyHint onAdd={() => actions.addStep()} />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={stepIds} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-2">
              {draftSteps.map((d, i) => (
                <StepRow
                  key={d.id}
                  id={d.id}
                  index={i}
                  step={d.step}
                  labels={labels}
                  candidates={candidates}
                  onChange={(step) => updateStepById(d.id, step)}
                  onRemove={() => actions.removeStep(d.id)}
                  onSaveToElement={onSaveToElement}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* 添加步骤 */}
      <div className="flex items-center justify-between">
        <Button
          size="sm"
          variant="outline"
          onClick={() => actions.addStep()}
          disabled={draftSteps.length >= 30}
        >
          <Plus className="size-3.5" />
          添加步骤
          <span className="text-[11px] opacity-60">{draftSteps.length}/30</span>
        </Button>
        {draftSteps.length > 1 && (
          <span className="text-[11px] text-muted-foreground">
            拖拽手柄可调整步骤顺序
          </span>
        )}
      </div>

      {/* 整条规则预览 */}
      <div className="rounded-xl border border-border bg-muted/30 p-3">
        <div className="flex items-center gap-2">
          <RotateCcw className="size-3.5 text-muted-foreground" />
          <span className="text-[12px] font-medium text-muted-foreground">
            整条规则预览(实时 3 条)
          </span>
        </div>
        {rulePreview.length === 0 ? (
          <p className="mt-2 text-[12px] text-muted-foreground/70">
            添加步骤后可预览完整地址拼接与标注效果
          </p>
        ) : (
          <div className="mt-2 space-y-1.5">
            {rulePreview.map((r, i) => (
              <div key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[12px]">{r.address}</span>
                <span className="flex flex-wrap gap-1">
                  {r.parts.map((p, j) => (
                    <Badge key={j} variant="secondary" className="text-[10.5px]">
                      {p.label}[{p.value}]
                    </Badge>
                  ))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}