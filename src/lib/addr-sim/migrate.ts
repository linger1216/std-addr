/**
 * 地址模拟数据旧格式读时迁移 —— 纯函数(便于单测)。
 *
 * 兼容三种历史形态:
 *  - 旧格式(步骤顶层直接挂数据源):`{ name, randomValue?, customValue?, randomNumber?, randomChinese?, prefix?, suffix?, skipRate }`
 *  - WIP 格式(数据源 key 用字母):`{ name, data: { A?, B?, C?, D? }, ... }`
 *  - 新格式(语义 key):`{ name, data: { randomValue?, customValue?, randomNumber?, randomChinese? }, ... }`
 *
 * 约定:读时迁移,不写回 DB(避免迁移写放大);写入时(create/update)直接存新结构。
 */
import {
  addrSimLabelConfigSchema,
  addrSimLabelDataSchema,
  addrSimStepSchema,
  type AddrSimLabelConfig,
  type AddrSimLabelData,
  type AddrSimStep,
} from "@/lib/validators/addr-sim";

/** WIP 字母 key → 语义 key(单一事实来源) */
const LEGACY_SOURCE_KEY_MAP: Record<string, string> = {
  A: "randomValue",
  B: "customValue",
  C: "randomNumber",
  D: "randomChinese",
};

/** 把 {A,B,C,D,...} 或 {randomValue,...} 统一迁移为语义 key 的原始对象 */
function migrateSourceKeys(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    out[LEGACY_SOURCE_KEY_MAP[k] ?? k] = v;
  }
  return out;
}

/**
 * 迁移 Label.data(地址要素默认数据来源,只取 4 个数据源)。
 * 支持旧字母 key({A,B,C,D})与已迁移的语义 key;无法解析返回 undefined。
 */
export function migrateLabelData(raw: unknown): AddrSimLabelData | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const mapped = migrateSourceKeys(raw);
  const parsed = addrSimLabelDataSchema.safeParse(mapped);
  return parsed.success ? parsed.data : undefined;
}

/**
 * 解析 Label.data 统一配置(4 个数据源 + 默认前后缀)。
 * 兼容旧字母 key;prefix/suffix 旧 text 单值也一并收敛(texts 数组)。
 */
export function parseLabelConfig(raw: unknown): AddrSimLabelConfig | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const mapped = migrateSourceKeys(raw);
  const merged: Record<string, unknown> = { ...mapped };
  if (mapped.prefix !== undefined) merged.prefix = fixAffix(mapped.prefix);
  if (mapped.suffix !== undefined) merged.suffix = fixAffix(mapped.suffix);
  const parsed = addrSimLabelConfigSchema.safeParse(merged);
  return parsed.success ? parsed.data : undefined;
}

/**
 * 旧 affix 结构(单值 text) → 新结构(texts 数组);已是新结构原样返回。
 * 旧:`{ text: "大", skipRate: 30 }` 新:`{ texts: ["大"], skipRate: 30 }`
 */
function fixAffix(affix: unknown): unknown {
  if (!affix || typeof affix !== "object") return affix;
  const a = affix as Record<string, unknown>;
  if (Array.isArray(a.texts)) return affix;
  if (typeof a.text === "string") {
    return {
      texts: a.text.trim() ? [a.text] : [],
      skipRate: typeof a.skipRate === "number" ? a.skipRate : 0,
    };
  }
  return affix;
}

/**
 * 迁移单个规则步骤:
 *  - 旧格式:顶层 randomValue/customValue/randomNumber/randomChinese → 收拢进 data
 *  - WIP 格式:data.{A,B,C,D} → 语义 key
 *  - prefix/suffix 旧 text 单值 → texts 数组
 *  - 丢弃旧 mode 字段
 */
export function migrateStep(raw: unknown): AddrSimStep {
  if (!raw || typeof raw !== "object") return raw as AddrSimStep;
  const step = raw as Record<string, unknown>;

  // 丢弃旧 mode(P0-6 不再写);拆出顶层来源 key 避免污染 data
  const { randomValue, customValue, randomNumber, randomChinese, ...rest } = step;
  delete rest.mode;

  // 收集 data:原 data(可能为 WIP 字母 key)+ 旧顶层来源 key
  let data: Record<string, unknown> = {};
  if (step.data && typeof step.data === "object" && !Array.isArray(step.data)) {
    data = { ...(step.data as Record<string, unknown>) };
  }
  if (randomValue !== undefined) data.randomValue = randomValue;
  if (customValue !== undefined) data.customValue = customValue;
  if (randomNumber !== undefined) data.randomNumber = randomNumber;
  if (randomChinese !== undefined) data.randomChinese = randomChinese;

  const dataMigrated = migrateSourceKeys(data);

  const migrated: unknown = {
    ...rest,
    ...(Object.keys(dataMigrated).length > 0 ? { data: dataMigrated } : {}),
    prefix: fixAffix(step.prefix),
    suffix: fixAffix(step.suffix),
  };

  // 用 zod 收敛类型(skipRate 默认 0、texts 默认 [] 等);失败则原样返回避免丢数据
  const parsed = addrSimStepSchema.safeParse(migrated);
  return parsed.success ? parsed.data : (migrated as AddrSimStep);
}
