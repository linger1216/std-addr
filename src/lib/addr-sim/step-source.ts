/**
 * 步骤数据来源判定(P0-6 适配) —— 纯函数(便于单测)。
 *
 * 4 个数据源 randomValue/customValue/randomNumber/randomChinese,各自代表一个数据集合;
 * getSourceKind 返回"当前步骤激活的第一个源",用于旧 UI 兼容(逐步废弃)。
 *
 * 优先级:randomValue > customValue > randomNumber > randomChinese
 */
import type { AddrSimStep } from "@/lib/validators/addr-sim";

/** 数据来源类型(展示用,实际生成走 data.randomValue/customValue/randomNumber/randomChinese 各自的抽 1 拼接) */
export type SourceKind =
  | "randomValue"
  | "customValue"
  | "randomNumber"
  | "randomChinese";

/** 默认来源(step 无任何 data 时) */
export const DEFAULT_SOURCE_KIND: SourceKind = "randomValue";

/** 判定步骤激活的数据源(返回第一个激活的 key) */
export function getSourceKind(step: AddrSimStep): SourceKind {
  const data = step.data;
  if (!data) return DEFAULT_SOURCE_KIND;
  if (data.randomValue !== undefined) return "randomValue";
  if (data.customValue !== undefined) return "customValue";
  if (data.randomNumber !== undefined) return "randomNumber";
  if (data.randomChinese !== undefined) return "randomChinese";
  return DEFAULT_SOURCE_KIND;
}
