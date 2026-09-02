/**
 * 地址模拟生成器 —— 纯函数、无副作用、rng 可注入(便于单测)。
 *
 * P0-6 改动:
 *  - 输入改为 ResolvedAddrSimStep(已合并 label 默认)
 *  - 4 个数据源(randomValue/customValue/randomNumber/randomChinese)是 4 个独立集合,配置任意组合时**任取其一**(随机选源取值)
 *  - 步骤 data 为空 → 视为无效,整步跳过
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
  type AddrSimSourceName,
  type ResolvedAddrSimStep,
  DEFAULT_AFFIX_SKIP_RATE,
} from "@/lib/validators/addr-sim";
import { numberToChinese } from "./chinese-numeral";
import { buildHanCharPool, pickChineseFragment } from "./name-corpus";
import { isResolvedStepValid } from "./resolve-step";
import { injectNoise } from "./noise";

/** 候选值池:实体表名 → 候选值数组(前端从 DB 实时拉取后传入) */
export type CandidatePool = Record<AddrSimSourceName, string[]>;

/** 随机来源注入(默认 Math.random;测试用固定序列) */
export type Rng = () => number;

/** 生成上下文 */
export interface GenerateContext {
  rng: Rng;
  candidates: CandidatePool;
  /**
   * P0-4:DB 真实名称全量(road/community/village/poi 合并去重),用于丰富 randomChinese 字池。
   * 由调用方(前端 hook)从 candidates 全量并集派生;不传则仅用词典 + 76 字兜底。
   */
  realNames?: readonly string[];
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

/** P0-4:真实命名常用字池 + DB 候选值片段(见 name-corpus.ts) */

/**
 * 生成随机中文串。
 * 池子由 buildHanCharPool 构建:DB 真实名称切片段 + 常用前缀/通名词典 + 76 字兜底。
 * 生成时每"次"抽 1 个片段(可能是 1~4 字),直到累计长度到达区间。
 * 这样首字命中"阳/锦/金/翠..."等真实前缀的概率显著提升,比原 76 字硬池更接近真实命名。
 */
function randomChinese(
  minLength: number,
  maxLength: number,
  rng: Rng,
  realNames?: readonly string[],
): string {
  const pool = buildHanCharPool(realNames ?? []);
  const targetLen = randInt(minLength, maxLength, rng);
  let out = "";
  // 防止死循环:迭代上限 = targetLen * 4(每段平均 1~2 字,4 倍足够)
  const maxIter = targetLen * 4 + 8;
  let iter = 0;
  while (out.length < targetLen && iter < maxIter) {
    out += pickChineseFragment(pool, rng);
    iter++;
  }
  // 兜底:还不够长时再用兜底字池补齐
  if (out.length < targetLen) {
    while (out.length < targetLen) {
      out += pickChineseFragment(pool, rng);
    }
  }
  return out;
}

/** 生成随机数字串 */
function randomNumber(
  minDigits: number,
  maxDigits: number,
  format: "arabic" | "chinese",
  rng: Rng,
  /** P0-3:真实位数直方图(可选);有值时按权重采样位数,key=位数(字符串),value=出现次数 */
  weights?: Record<string, number>,
): string {
  let digits: number;
  if (weights && Object.keys(weights).length > 0) {
    // 按权重采样位数:把直方图展开成 [digits] 数组,随机抽一个
    const bucket: number[] = [];
    for (const [k, count] of Object.entries(weights)) {
      const d = Number(k);
      if (!Number.isFinite(d) || d < minDigits || d > maxDigits || count <= 0) continue;
      for (let i = 0; i < count; i++) bucket.push(d);
    }
    digits = bucket.length > 0
      ? bucket[Math.floor(rng() * bucket.length)]!
      : randInt(minDigits, maxDigits, rng);
  } else {
    digits = randInt(minDigits, maxDigits, rng);
  }
  // 首位不能为 0,保证 digits 位有效数字
  let n = randInt(1, 9, rng);
  for (let i = 1; i < digits; i++) {
    n = n * 10 + randInt(0, 9, rng);
  }
  return format === "chinese" ? numberToChinese(n) : String(n);
}

/**
 * 生成单个步骤的值;步骤被 skipRate 跳过时返回 null。
 *
 * P0-6 语义:
 *  - 输入是 ResolvedAddrSimStep(已合并 label 默认配置)
 *  - 4 个数据源 randomValue/customValue/randomNumber/randomChinese 是 4 个独立集合,
 *    配置任意组合时**任取其一**:从激活源里随机选一个,再从这个源里抽 1 条;
 *    若该源取不到值(池空)则环形尝试下一个激活源。
 *  - data 为空 → 整步跳过(返回 null)
 *
 * 前后缀各自按 skipRate 决定是否拼接;prefix/suffix 来源已由 resolver 决定(取 step override 或 label 默认)。
 */
export function generateStepValue(
  step: ResolvedAddrSimStep,
  ctx: GenerateContext,
): string | null {
  if (hits(step.skipRate, ctx.rng)) return null;
  if (!isResolvedStepValid(step)) return null;

  // 收集激活源的取值器(每个源独立抽 1;返回 null 表示该源此刻取不到值)
  const makers: Array<() => string | null> = [];

  if (step.data.randomValue) {
    makers.push(() => {
      const pool = ctx.candidates[step.data.randomValue!.name] ?? [];
      return pool.length > 0 ? pickOne(pool, ctx.rng)! : null;
    });
  }
  if (step.data.customValue && step.data.customValue.list.length > 0) {
    makers.push(() => pickOne(step.data.customValue!.list, ctx.rng)!);
  }
  if (step.data.randomNumber) {
    const c = step.data.randomNumber;
    makers.push(() => randomNumber(c.minDigits, c.maxDigits, c.format, ctx.rng, c.weights));
  }
  if (step.data.randomChinese) {
    const d = step.data.randomChinese;
    makers.push(() => randomChinese(d.minLength, d.maxLength, ctx.rng, ctx.realNames));
  }

  if (makers.length === 0) return null;

  // 任取其一:随机起点环形遍历,取到第一个非空值。
  // 单源时无额外 rng 消耗(与旧行为一致);多源才抽起点。
  const start = makers.length > 1 ? Math.floor(ctx.rng() * makers.length) : 0;
  let value: string | null = null;
  for (let i = 0; i < makers.length; i++) {
    const v = makers[(start + i) % makers.length]!();
    if (v !== null) {
      value = v;
      break;
    }
  }
  if (value === null) return null;

  // 前后缀(各自独立跳过率,默认 DEFAULT_AFFIX_SKIP_RATE;texts 非空时随机抽一个拼接)
  if (step.prefix && step.prefix.texts.length > 0 && !hits(step.prefix.skipRate ?? DEFAULT_AFFIX_SKIP_RATE, ctx.rng)) {
    value = pickOne(step.prefix.texts, ctx.rng)! + value;
  }
  if (step.suffix && step.suffix.texts.length > 0 && !hits(step.suffix.skipRate ?? DEFAULT_AFFIX_SKIP_RATE, ctx.rng)) {
    value = value + pickOne(step.suffix.texts, ctx.rng)!;
  }

  // 干扰率:按概率注入错别字/丢字/漏字(用于训练干扰项)
  if (step.noiseRate > 0 && value.length > 0) {
    value = injectNoise(value, step.noiseRate, ctx.rng);
  }
  return value;
}

/**
 * 按步骤顺序生成完整地址(空串拼接)+ 分片标注。
 *
 * 输入是已 resolve 的步骤(由调用方在调用前 resolveStepWithLabel)。
 */
export function generateAddress(
  steps: ResolvedAddrSimStep[],
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
 * 输入是已 resolve 的步骤。
 */
export function generateDataset(
  steps: ResolvedAddrSimStep[],
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

/** 按规则 + 数量生成(供生成卡片按比例合成);输入已 resolve */
export function generateForRules(
  rules: Array<{ name: string; steps: ResolvedAddrSimStep[] }>,
  counts: number[],
  ctx: GenerateContext,
): LabelStudioItem[] {
  const items: LabelStudioItem[] = [];
  rules.forEach((rule, i) => {
    const n = counts[i] ?? 0;
    if (n <= 0) return;
    const generated = generateDataset(rule.steps, n, ctx);
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
 * 输入是已 resolve 的步骤。
 */
export function previewStepValues(
  step: ResolvedAddrSimStep,
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

