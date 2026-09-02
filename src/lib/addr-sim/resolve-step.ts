/**
 * P0-6:Label 默认配置 与 step override 的合并(resolver)。
 *
 * 规则:
 *  - step.data 各 key(randomValue/customValue/randomNumber/randomChinese)若存在 → 覆盖 label.data 同 key
 *  - step.prefix / step.suffix 若存在 → 覆盖 label.prefix / label.suffix
 *  - 全部为空则取 label 默认;label 也为空 → 视为该步无效(调用方需自处理)
 *
 * 这样:
 *  - label 表作为"地址要素的默认配置中心",集中维护 data/prefix/suffix
 *  - 规则步骤只写差异(override),不重复存储公共配置
 */
import {
  DEFAULT_AFFIX_SKIP_RATE,
  DEFAULT_NOISE_RATE,
  DEFAULT_SKIP_RATE,
  type AddrSimAffix,
  type AddrSimLabel,
  type AddrSimLabelData,
  type AddrSimStep,
  type ResolvedAddrSimStep,
} from "@/lib/validators/addr-sim";

/** 深合并 data:逐 key 合并,step 覆盖 label。
 *  - step.data 某 key 存在 → 用 step(override)
 *  - step.data 某 key 缺失(或整个 data 为空)→ 用 label 默认
 * 语义:"需要自定义才在规则里定义,否则引用 label 默认"。
 */
function mergeData(
  labelData: AddrSimLabelData | undefined,
  stepData: AddrSimLabelData | undefined,
): AddrSimLabelData {
  const base = labelData ?? {};
  const override = stepData ?? {};
  return {
    randomValue: override.randomValue ?? base.randomValue,
    customValue: override.customValue ?? base.customValue,
    randomNumber: override.randomNumber ?? base.randomNumber,
    randomChinese: override.randomChinese ?? base.randomChinese,
  };
}

/** 兜底 affix 的跳过率:未显式设置 → DEFAULT_AFFIX_SKIP_RATE(10) */
function resolveAffix(affix: AddrSimAffix | undefined): AddrSimAffix | undefined {
  if (!affix) return undefined;
  return { ...affix, skipRate: affix.skipRate ?? DEFAULT_AFFIX_SKIP_RATE };
}

/**
 * 把 step + label 合并为一个 resolved step。
 *
 * @param step 规则步骤(含 override 或全空)
 * @param label 同 name 的 Label 字典条目(若为 null/undefined 则视为 data 全空)
 * @returns 合并后的 resolved step(data 必有值,prefix/suffix 可选,rate 均已兜底)
 */
export function resolveStepWithLabel(
  step: AddrSimStep,
  label: AddrSimLabel | null | undefined,
): ResolvedAddrSimStep {
  const labelData = label?.data;
  const labelPrefix = label?.prefix;
  const labelSuffix = label?.suffix;

  // 优先取非空 override(空对象 {} 也算 override,不引用 label)
  const mergedPrefix = step.prefix ?? labelPrefix;
  const mergedSuffix = step.suffix ?? labelSuffix;

  return {
    name: step.name,
    data: mergeData(labelData, step.data),
    prefix: resolveAffix(mergedPrefix),
    suffix: resolveAffix(mergedSuffix),
    // 步骤未显式设置 → 引用 label 默认整体跳过率;再兜底全局默认
    skipRate: step.skipRate ?? label?.skipRate ?? DEFAULT_SKIP_RATE,
    // 干扰率:步骤可单独覆盖,否则引用 label 默认;再兜底全局默认
    noiseRate: step.noiseRate ?? label?.noiseRate ?? DEFAULT_NOISE_RATE,
  };
}

/**
 * 解析后是否"有效"(至少有一个数据源配置)。
 * 无效 step 在生成时应被跳过(返回 null)。
 */
export function isResolvedStepValid(step: ResolvedAddrSimStep): boolean {
  return [step.data.randomValue, step.data.customValue, step.data.randomNumber, step.data.randomChinese].some(
    (s) => s !== undefined,
  );
}

/** 过滤有效 step(用于 generateAddress 前置清洗) */
export function filterValidResolvedSteps(
  steps: ResolvedAddrSimStep[],
): ResolvedAddrSimStep[] {
  return steps.filter(isResolvedStepValid);
}

/** 把 affix 兜底成统一形态(空对象转 undefined,便于下游判定) */
export function normalizeAffix(affix: AddrSimAffix | undefined): AddrSimAffix | undefined {
  if (!affix) return undefined;
  const texts = (affix.texts ?? []).filter((t) => t.trim() !== "");
  if (texts.length === 0 && (affix.skipRate ?? 0) === 0) return undefined;
  return { texts, skipRate: affix.skipRate ?? 0 };
}
