/**
 * 步骤数据来源判定 —— 纯函数(从 step-row 组件中抽出,便于单测)。
 */
import type { AddrSimStep } from "@/lib/validators/addr-sim";

/** 数据来源四选一 */
export type SourceKind =
  | "randomValue"
  | "customValue"
  | "randomNumber"
  | "randomChinese";

/** 默认来源(step 为空时的展示降级) */
export const DEFAULT_SOURCE_KIND: SourceKind = "randomValue";

/** 判定步骤当前生效的数据来源;无字段时按默认返回 */
export function getSourceKind(step: AddrSimStep): SourceKind {
  if (step.randomValue) return "randomValue";
  if (step.customValue) return "customValue";
  if (step.randomNumber) return "randomNumber";
  if (step.randomChinese) return "randomChinese";
  return DEFAULT_SOURCE_KIND;
}