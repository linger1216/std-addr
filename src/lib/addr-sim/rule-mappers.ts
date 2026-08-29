/**
 * ruleList 响应 → 前端 AddrSimRuleRow 映射(纯函数,便于单测)。
 *
 * 后端返回的 steps 为 unknown[](JSON 列),确保变为 AddrSimStep[];
 * status 归一为 0|1(后端可能返回任意 number)。
 */
import type { AddrSimStep } from "@/lib/validators/addr-sim";
import type { AddrSimRuleRow } from "@/components/modules/addr-sim/addr-sim-rule-editor";

/** ruleList procedure 的返回元素形态(按 tRPC 推断,与后端字段对齐) */
export interface RuleListRow {
  id: string;
  name: string;
  steps?: unknown;
  radio?: number | null;
  status?: number;
  updatedAt?: unknown;
}

export function toRuleRow(r: RuleListRow): AddrSimRuleRow {
  return {
    id: r.id,
    name: r.name,
    steps: (
      Array.isArray(r.steps) ? r.steps : []
    ) as AddrSimStep[],
    radio: r.radio ?? null,
    status: r.status === 0 ? 0 : 1,
    updatedAt: toUpdatedAtString(r.updatedAt),
  };
}

export function toRuleRows(rows: RuleListRow[]): AddrSimRuleRow[] {
  return rows.map(toRuleRow);
}

/** updatedAt 归一为可展示字符串(ISO / 原始字符串),无法识别 → null */
function toUpdatedAtString(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  return null;
}