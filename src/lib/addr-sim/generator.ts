/**
 * 地址模拟生成器 —— 纯函数、无副作用、rng 可注入(便于单测)。
 *
 * 输入:有序步骤数组 + 候选值池;输出:地址串 + Label Studio 分片标注。
 *
 * Label Studio 标注格式(result 数组):
 * {
 *   from_name: "label",
 *   to_name: "address",
 *   type: "labels",
 *   value: { start, end, labels: ["城市"], text: "上海" }
 * }
 * start/end 为地址串中的字符偏移(UTF-16 code unit,与 JS slice 一致)。
 */

import {
  type AddrSimStep,
  type AddrSimSourceName,
} from "@/lib/validators/addr-sim";
import { numberToChinese } from "./chinese-numeral";

/** 候选值池:实体表名 → 候选值数组(前端从 DB 实时拉取后传入) */
export type CandidatePool = Record<AddrSimSourceName, string[]>;

/** 随机来源注入(默认 Math.random;测试用固定序列) */
export type Rng = () => number;

/** 生成上下文 */
export interface GenerateContext {
  rng: Rng;
  candidates: CandidatePool;
}

/** Label Studio result 单条分片 */
export interface AnnotationResult {
  from_name: string;
  to_name: string;
  type: string;
  value: {
    start: number;
    end: number;
    labels: string[];
    text: string;
  };
}

/** 一次生成的结果:地址 + 标注分片 */
export interface GeneratedAddress {
  address: string;
  result: AnnotationResult[];
}

/** 判断是否命中概率(0~100) */
function hits(p: number, rng: Rng): boolean {
  if (p <= 0) return false;
  if (p >= 100) return true;
  return rng() * 100 < p;
}

/** 从数组中随机取一个(空数组返回 null) */
export function pickOne<T>(arr: T[], rng: Rng): T | null {
  if (arr.length === 0) return null;
  return arr[Math.floor(rng() * arr.length)]!;
}

/** 随机整数 [min, max] 闭区间 */
function randInt(min: number, max: number, rng: Rng): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** 随机中文汉字池(常用字,避免生僻字) */
const HAN_CHARS =
  "长街新村园苑里坊巷甲乙丙丁东南西北中白青红金秀福安平华兴庆和顺昌明德仁爱信义礼智诚心山水花木竹石云雨风光明春华秋实雅静乐康祥瑞";

/** 生成随机中文串 */
function randomChinese(minLength: number, maxLength: number, rng: Rng): string {
  const len = randInt(minLength, maxLength, rng);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += HAN_CHARS[Math.floor(rng() * HAN_CHARS.length)]!;
  }
  return out;
}

/** 生成随机数字串 */
function randomNumber(
  minDigits: number,
  maxDigits: number,
  format: "arabic" | "chinese",
  rng: Rng,
): string {
  const digits = randInt(minDigits, maxDigits, rng);
  // 首位不能为 0,保证 digits 位有效数字
  let n = randInt(1, 9, rng);
  for (let i = 1; i < digits; i++) {
    n = n * 10 + randInt(0, 9, rng);
  }
  return format === "chinese" ? numberToChinese(n) : String(n);
}

/**
 * 生成单个步骤的值;步骤被 skipRate 跳过时返回 null。
 * 数据来源四选一:
 *  - randomValue:实体表候选值(random 取一)
 *  - customValue:用户自定义候选值列表(random 取一)
 *  - randomNumber:随机数字(arabic / chinese)
 *  - randomChinese:随机中文
 * 前后缀各自按 skipRate 决定是否拼接。
 */
export function generateStepValue(
  step: AddrSimStep,
  ctx: GenerateContext,
): string | null {
  if (hits(step.skipRate, ctx.rng)) return null;

  let value: string | null = null;

  if (step.randomValue) {
    const fromTable = ctx.candidates[step.randomValue.name] ?? [];
    value = pickOne(fromTable, ctx.rng);
    // 候选值池为空 → 该步骤视为跳过
    if (value === null) return null;
  } else if (step.customValue) {
    // 自定义列表为空 → 跳过(生成结果不含该步骤)
    value = pickOne(step.customValue.list, ctx.rng);
    if (value === null) return null;
  } else if (step.randomNumber) {
    const rn = step.randomNumber;
    value = randomNumber(rn.minDigits, rn.maxDigits, rn.format, ctx.rng);
  } else if (step.randomChinese) {
    const rc = step.randomChinese;
    value = randomChinese(rc.minLength, rc.maxLength, ctx.rng);
  } else {
    return null;
  }

  // 前后缀(各自独立跳过率;texts 非空时随机抽一个拼接)
  if (step.prefix && step.prefix.texts.length > 0 && !hits(step.prefix.skipRate, ctx.rng)) {
    value = pickOne(step.prefix.texts, ctx.rng) + value;
  }
  if (step.suffix && step.suffix.texts.length > 0 && !hits(step.suffix.skipRate, ctx.rng)) {
    value = value + pickOne(step.suffix.texts, ctx.rng);
  }
  return value;
}

/**
 * 按步骤顺序生成完整地址(空串拼接)+ 分片标注。
 */
export function generateAddress(
  steps: AddrSimStep[],
  ctx: GenerateContext,
): GeneratedAddress {
  let address = "";
  const result: AnnotationResult[] = [];

  for (const step of steps) {
    const value = generateStepValue(step, ctx);
    if (value === null) continue;

    const start = address.length;
    address += value;
    result.push({
      from_name: "label",
      to_name: "address",
      type: "labels",
      value: {
        start,
        end: start + value.length,
        labels: [step.name],
        text: value,
      },
    });
  }

  return { address, result };
}

/** Label Studio 标注文件单条(含 data + annotations.result) */
export interface LabelStudioItem {
  data: { address: string };
  annotations: Array<{ result: AnnotationResult[] }>;
  /** 附加元信息(如规则名,导出时剔除) */
  meta?: Record<string, unknown>;
}

/**
 * 批量生成:每条记录带自增 id(Label Studio 导入通用格式)。
 */
export function generateDataset(
  steps: AddrSimStep[],
  count: number,
  ctx: GenerateContext,
): LabelStudioItem[] {
  const items: LabelStudioItem[] = [];
  for (let i = 0; i < count; i++) {
    const { address, result } = generateAddress(steps, ctx);
    items.push({
      data: { address },
      annotations: [{ result }],
    });
  }
  return items;
}

/** 按规则 + 数量生成(供生成卡片按比例合成) */
export function generateForRules(
  rules: Array<{ name: string; steps: AddrSimStep[] }>,
  counts: number[],
  ctx: GenerateContext,
): LabelStudioItem[] {
  const items: LabelStudioItem[] = [];
  rules.forEach((rule, i) => {
    const n = counts[i] ?? 0;
    if (n <= 0) return;
    const generated = generateDataset(rule.steps, n, ctx);
    // 打上规则名,便于前端按规则区分
    items.push(
      ...generated.map((item) => ({
        ...item,
        meta: { rule: rule.name },
      })),
    );
  });
  return items;
}

/**
 * 按比例把总条数分给各规则(向下取整 + 余数并入第一条)。
 *
 * 必须在"预览小总量"与"导出全量"间保持一致行为:
 * 例:2 条规则 66/34,总 10 → [6, 3] + 余数 1 并入第一条 → [7, 3](合计 10)。
 * 旧的 scaledCounts 不做余数校正,预览条目数与设定总量不一致(bug 修复)。
 */
export function computeCountsByRatios(
  ratios: Array<{ id: string; ratio: number }>,
  total: number,
): number[] {
  if (ratios.length === 0) return [];
  const base = ratios.map((r) =>
    Math.max(0, Math.floor((total * (r.ratio ?? 0)) / 100)),
  );
  const used = base.reduce((a, b) => a + b, 0);
  const extra = Math.max(0, total - used);
  if (base.length > 0) base[0] = (base[0] ?? 0) + extra;
  return base;
}

/** Fisher-Yates 原地洗牌;返回同一数组(导出乱序用) */
export function shuffleArray<T>(arr: T[], rng: () => number = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/**
 * 预览单步:当前配置生成 10 个样本值(不做地址拼接)。
 * 返回 null 表示该步被跳过或候选池为空。
 */
export function previewStepValues(
  step: AddrSimStep,
  count: number,
  ctx: GenerateContext,
): Array<string | null> {
  const samples: Array<string | null> = [];
  for (let i = 0; i < count; i++) {
    samples.push(generateStepValue(step, ctx));
  }
  return samples;
}


/**
 * 完整的 Label Studio 标注导出格式(可直接导入 LS 的"标注完成"任务文件)。
 *
 * 参考真实 LS 导出样例生成,字段结构与样例一致:
 *  - 顶层: id / data.address / annotations[] / file_upload / drafts / predictions /
 *          meta / created_at / updated_at / inner_id / 各类计数
 *  - annotation: completed_by / result[] / was_cancelled / ground_truth / created_at /
 *                updated_at / lead_time / prediction / unique_id / task / project ...
 *  - result 每项: value{start,end,text,labels} / id(随机)/ from_name / to_name /
 *                 type:"labels" / origin:"manual"
 *
 * from_name / to_name 由导出 Dialog 输入(默认 "standard" / "address")。
 */
export interface LabelStudioExportOptions {
  fromName: string;
  toName: string;
  /** 显示在 file_upload 字段的文件名 */
  fileUpload?: string;
  /** 项目 id(默认 1) */
  project?: number;
  /** 完成人 id(默认 1) */
  completedBy?: number;
  /** 时间基准(默认 now,测试可注入) */
  now?: Date;
}

/** 生成 LS 风格的短随机 id(字母数字下划线连字符,8~10 位) */
export function lsRandomId(len = 8): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

/**
 * 把生成结果(items)转成 LS 完整标注导出格式。
 * 每条 annotations 里的 result 由 from/to_name 替换,并补充 origin/id。
 */
export function toLabelStudioExported(
  items: LabelStudioItem[],
  opts: LabelStudioExportOptions,
): Array<Record<string, unknown>> {
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const project = opts.project ?? 1;
  const completedBy = opts.completedBy ?? 1;

  return items.map((item, idx) => {
    const taskId = idx + 1;
    const result = (item.annotations[0]?.result ?? []).map((r) => ({
      value: r.value,
      id: lsRandomId(),
      from_name: opts.fromName,
      to_name: opts.toName,
      type: "labels",
      origin: "manual",
    }));
    return {
      id: taskId,
      annotations: [
        {
          id: taskId,
          completed_by: completedBy,
          result,
          was_cancelled: false,
          ground_truth: false,
          created_at: nowIso,
          updated_at: nowIso,
          draft_created_at: null,
          lead_time: Math.round(20 + Math.random() * 40),
          prediction: {},
          result_count: 0,
          unique_id: [
            lsRandomId(8),
            lsRandomId(4),
            lsRandomId(4),
            lsRandomId(4),
            lsRandomId(12),
          ].join("-"),
          import_id: null,
          last_action: null,
          bulk_created: false,
          task: taskId,
          project,
          updated_by: null,
          parent_prediction: null,
          parent_annotation: null,
          last_created_by: null,
        },
      ],
      file_upload: opts.fileUpload ?? "simulated_addresses.json",
      drafts: [],
      predictions: [],
      data: item.data,
      meta: {},
      created_at: nowIso,
      updated_at: nowIso,
      allow_skip: true,
      inner_id: taskId,
      total_annotations: 1,
      cancelled_annotations: 0,
      total_predictions: 0,
      comment_count: 0,
      unresolved_comment_count: 0,
      last_comment_updated_at: null,
      project,
      updated_by: null,
      comment_authors: [],
    };
  });
}

