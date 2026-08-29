/**
 * 地址模拟(AddrSim)页 UI store —— 模块私有。
 *
 * 职责:
 *  - 规则区:多选(批量生成)、当前编辑草稿(名称 + 有序步骤,本地临时 id)
 *  - 生成区:总条数、各规则百分比、最近一次生成结果
 *
 * 步骤编辑草稿的 id 仅用于前端(拖拽/删除),保存时剥掉。
 */

"use client";

import { create } from "zustand";
import { useShallow } from "zustand/shallow";

import type { AddrSimStep } from "@/lib/validators/addr-sim";
import type { LabelStudioItem } from "@/lib/addr-sim/generator";

/** 编辑中步骤:数据 + 本地临时 id */
export interface EditorStep {
  id: string;
  step: AddrSimStep;
}

/** 生成结果单条(记录来源规则名) */
export interface GeneratedRow {
  rule: string;
  item: LabelStudioItem;
}

let stepSeq = 0;
function newStepId(): string {
  stepSeq += 1;
  return `step-${stepSeq}`;
}

/** 默认新步骤:实体表来源(road) */
export function defaultStep(): AddrSimStep {
  return {
    name: "",
    randomValue: { name: "road" },
    skipRate: 0,
  };
}

/** 给步骤数组补本地 id(编辑/新建时从持久化数据深拷贝) */
export function toEditorSteps(steps: AddrSimStep[]): EditorStep[] {
  return steps.map((s) => ({
    id: newStepId(),
    step: {
      ...s,
      // 深拷贝数组字段,避免共享引用
      randomValue: s.randomValue ? { ...s.randomValue } : undefined,
      customValue: s.customValue
        ? { ...s.customValue, list: [...(s.customValue.list ?? [])] }
        : undefined,
      randomNumber: s.randomNumber ? { ...s.randomNumber } : undefined,
      randomChinese: s.randomChinese ? { ...s.randomChinese } : undefined,
      prefix: s.prefix
        ? { ...s.prefix, texts: [...(s.prefix.texts ?? [])] }
        : undefined,
      suffix: s.suffix
        ? { ...s.suffix, texts: [...(s.suffix.texts ?? [])] }
        : undefined,
    },
  }));
}

/** 编辑草稿 → 可保存的步骤数组(剥掉临时 id) */
export function toStorableSteps(drafts: EditorStep[]): AddrSimStep[] {
  return drafts.map((d) => d.step);
}

interface State {
  // —— 规则区 ——
  selectedIds: string[];
  /** 规则占比表(id → radio 1~100 或 null),由 page 在 ruleList 加载时同步;
   *  勾选/快捷选择时用它给 ratios 自动赋值 */
  radioMap: Record<string, number | null>;
  /** 正在编辑的规则 id;null + editingName 非空 = 新建 */
  editingId: string | null;
  editingName: string;
  /** 编辑中占比 1~100(可空 = 未设置) */
  editingRadio: number | null;
  /** 编辑中状态:1 启用 / 0 禁用 */
  editingStatus: 0 | 1;
  draftSteps: EditorStep[];
  /**
   * 用户是否主动改过 name 输入框。true 时不再按 steps.name 拼接自动重命名,
   * 避免覆盖用户自定义名;false 时,任意 step.name 变化都会把 editingName 同步为拼接结果。
   */
  nameEdited: boolean;

  // —— 生成区 ——
  totalCount: number;
  /** ruleId → 百分比 */
  ratios: Record<string, number>;
  generated: GeneratedRow[] | null;
  generatedAt: number | null;
}

interface Actions {
  // 规则多选(radio = 该规则占比 1~100,用于初始化生成比例)
  toggleSelect: (id: string, radio?: number | null) => void;
  clearSelect: () => void;
  setSelected: (ids: string[]) => void;
  /** 同步规则占比表(ruleList 加载/刷新时调用) */
  setRadioMap: (map: Record<string, number | null>) => void;

  // 编辑器
  openCreate: () => void;
  openEdit: (
    id: string,
    name: string,
    steps: AddrSimStep[],
    radio?: number | null,
    status?: 0 | 1,
  ) => void;
  closeEditor: () => void;
  setEditingName: (name: string) => void;
  /** 标记 name 输入框被用户主动改动过(由 name input onChange 调用) */
  markNameEdited: () => void;
  setEditingRadio: (radio: number | null) => void;
  setEditingStatus: (status: 0 | 1) => void;
  /**
   * 编辑中的规则被删除时调用:保留草稿与名称,脱离原 id → 保存时按"新建"处理。
   */
  detachEditor: () => void;
  addStep: (step?: AddrSimStep) => void;
  updateStep: (id: string, step: AddrSimStep) => void;
  removeStep: (id: string) => void;
  moveStep: (from: number, to: number) => void;

  // 生成
  setTotalCount: (n: number) => void;
  setRatio: (id: string, pct: number) => void;
  autoBalance: (ids: string[]) => void;
  setGenerated: (rows: GeneratedRow[] | null, at?: number) => void;
}

function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  if (!item) return next;
  next.splice(to, 0, item);
  return next;
}

export const useAddrSimStore = create<State & Actions>()((set, get) => ({
  selectedIds: [],
  radioMap: {},
  editingId: null,
  editingName: "",
  editingRadio: null,
  editingStatus: 1,
  draftSteps: [],
  nameEdited: false,

  totalCount: 1000,
  ratios: {},
  generated: null,
  generatedAt: null,

  toggleSelect: (id, radio) => {
    const ids = get().selectedIds;
    const next = ids.includes(id)
      ? ids.filter((x) => x !== id)
      : [...ids, id];
    // 新增选中且未分配比例时:规则自身占比(radio 参数或 radioMap),未设置则均分
    const ratios = { ...get().ratios };
    if (next.length > 0) {
      const share = Math.floor(100 / next.length);
      for (const x of next) {
        ratios[x] ??= radio ?? get().radioMap[x] ?? share;
      }
    }
    // 移出选中时清理比例
    for (const x of ids) {
      if (!next.includes(x)) delete ratios[x];
    }
    set({ selectedIds: next, ratios });
  },

  clearSelect: () => set({ selectedIds: [], ratios: {} }),

  setSelected: (ids) => {
    // 快捷选择/全选:给尚未初始化的选中规则自动按其占比(radioMap)赋值,缺失则均分
    const ratios = { ...get().ratios };
    const missing = ids.filter((x) => ratios[x] === undefined);
    if (missing.length > 0) {
      const share = Math.floor(100 / ids.length);
      for (const x of missing) {
        ratios[x] = get().radioMap[x] ?? share;
      }
    }
    set({ selectedIds: ids, ratios });
  },

  setRadioMap: (map) => set({ radioMap: map }),

  openCreate: () =>
    set({
      editingId: null,
      editingName: "",
      editingRadio: null,
      editingStatus: 1,
      draftSteps: toEditorSteps([defaultStep()]),
      nameEdited: false,
    }),

  openEdit: (id, name, steps, radio, status) =>
    set({
      editingId: id,
      editingName: name,
      editingRadio: radio ?? null,
      editingStatus: status ?? 1,
      draftSteps: toEditorSteps(steps),
      // 刚打开编辑器时,nameEdited = false:如果 steps 拼接 name 与原 name 不同,
      // 编辑器会同步覆盖(让用户看到真实派生的名字)。但页面的 useEffect 比较
      // editingName 与拼接值,如果不同则设置一次(并标 true),后续用户改 step.name
      // 才会继续同步。
      nameEdited: false,
    }),

  closeEditor: () =>
    set({
      editingId: null,
      editingName: "",
      editingRadio: null,
      editingStatus: 1,
      draftSteps: [],
      nameEdited: false,
    }),

  setEditingName: (name) =>
    set({ editingName: name, nameEdited: true }),

  detachEditor: () => {
    const { editingId, editingName } = get();
    // 无编辑中规则 → 无操作
    if (!editingId) return;
    set({
      editingId: null,
      // 名称加标记,提示用户该草稿已脱离原规则
      editingName: editingName ? `${editingName}(已脱离)` : editingName,
    });
  },

  setEditingRadio: (radio) => set({ editingRadio: radio }),
  setEditingStatus: (status) => set({ editingStatus: status }),

  markNameEdited: () => set({ nameEdited: true }),

  addStep: (step) => {
    const drafts = [...get().draftSteps];
    drafts.push({ id: newStepId(), step: step ?? defaultStep() });
    set({ draftSteps: drafts });
  },

  updateStep: (id, step) => {
    const state = get();
    // 找出被改动的 step 前后 name,仅在 name 真的变了时才触发自动重命名
    const prev = state.draftSteps.find((d) => d.id === id)?.step;
    const nameChanged =
      prev?.name !== step.name && step.name !== undefined;
    const nextDrafts = state.draftSteps.map((d) =>
      d.id === id ? { ...d, step } : d,
    );
    // 若用户尚未主动改名 → 按 steps.name 拼接重派生(同步反映要素改动)
    if (nameChanged && !state.nameEdited) {
      const derived = nextDrafts.map((d) => d.step.name).join("-") || "提取规则";
      set({
        draftSteps: nextDrafts,
        editingName: derived,
        // 标 true:派生过的 name 视为用户也已"确认"过,避免后续编辑反向覆盖
        nameEdited: true,
      });
    } else {
      set({ draftSteps: nextDrafts });
    }
  },

  removeStep: (id) => {
    set({ draftSteps: get().draftSteps.filter((d) => d.id !== id) });
  },

  moveStep: (from, to) => {
    const drafts = get().draftSteps;
    if (from < 0 || from >= drafts.length || to < 0 || to >= drafts.length) {
      return;
    }
    set({ draftSteps: arrayMove(drafts, from, to) });
  },

  setTotalCount: (n) => set({ totalCount: Math.max(1, Math.min(100000, n)) }),

  setRatio: (id, pct) => {
    const v = Math.max(0, Math.min(100, Math.round(pct)));
    set({ ratios: { ...get().ratios, [id]: v } });
  },

  autoBalance: (ids) => {
    if (ids.length === 0) return;
    const share = Math.floor(100 / ids.length);
    const ratios: Record<string, number> = {};
    for (const id of ids) ratios[id] = share;
    set({ ratios });
  },

  setGenerated: (rows, at) =>
    set({ generated: rows, generatedAt: at ?? Date.now() }),
}));

/* —— 拆分 selectors —— */

type RuleSlice = Pick<
  State,
  | "selectedIds"
  | "editingId"
  | "editingName"
  | "editingRadio"
  | "editingStatus"
  | "draftSteps"
>;

export function useAddrSimRuleState(): RuleSlice {
  return useAddrSimStore(
    useShallow((s) => ({
      selectedIds: s.selectedIds,
      editingId: s.editingId,
      editingName: s.editingName,
      editingRadio: s.editingRadio,
      editingStatus: s.editingStatus,
      draftSteps: s.draftSteps,
    })),
  );
}

type GenerateSlice = Pick<
  State,
  "totalCount" | "ratios" | "generated" | "generatedAt"
> & Pick<Actions, "setTotalCount" | "setRatio" | "autoBalance" | "setGenerated">;

export function useAddrSimGenerateState(): GenerateSlice {
  return useAddrSimStore(
    useShallow((s) => ({
      totalCount: s.totalCount,
      ratios: s.ratios,
      generated: s.generated,
      generatedAt: s.generatedAt,
      setTotalCount: s.setTotalCount,
      setRatio: s.setRatio,
      autoBalance: s.autoBalance,
      setGenerated: s.setGenerated,
    })),
  );
}

type ActionsSlice = Pick<
  Actions,
  | "toggleSelect"
  | "clearSelect"
  | "setSelected"
  | "setRadioMap"
  | "openCreate"
  | "openEdit"
  | "closeEditor"
  | "setEditingName"
  | "setEditingRadio"
  | "setEditingStatus"
  | "detachEditor"
  | "addStep"
  | "updateStep"
  | "removeStep"
  | "moveStep"
>;

export function useAddrSimActions(): ActionsSlice {
  return useAddrSimStore(
    useShallow((s) => ({
      toggleSelect: s.toggleSelect,
      clearSelect: s.clearSelect,
      setSelected: s.setSelected,
      setRadioMap: s.setRadioMap,
      openCreate: s.openCreate,
      openEdit: s.openEdit,
      closeEditor: s.closeEditor,
      setEditingName: s.setEditingName,
      setEditingRadio: s.setEditingRadio,
      setEditingStatus: s.setEditingStatus,
      detachEditor: s.detachEditor,
      addStep: s.addStep,
      updateStep: s.updateStep,
      removeStep: s.removeStep,
      moveStep: s.moveStep,
    })),
  );
}