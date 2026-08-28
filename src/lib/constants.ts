/**
 * 全局常量 —— 展示层与业务层共用。
 * ponytail: 常量量级还小,单文件集中管理;等超过 ~12 组再按域拆目录。
 */

// ─── 展示层 ────────────────────────────────────────────

/** 空值占位符:列表/详情里 null|undefined 统一显示 —(与各模块详情页既有展示一致) */
export const PLACEHOLDER_EMPTY = "-";

/** 分页每页可选条数 */
export const PAGE_SIZES = [10, 20, 50, 100] as const;

/** 空值兜底 helper:null/undefined → 占位符 */
export function orEmpty(value: string | null | undefined): string {
  return value ?? PLACEHOLDER_EMPTY;
}

/** 统一提取 Error 信息(避免到处 err instanceof Error) */
export function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * 区划 ID 归一:""(= 表单"未指定")/ undefined → null(清空);其它 → 原样。
 * 注意不能用 ?? / ||:空串是合法的"未指定"语义,必须被转成 null。
 */
export function toRegionIdOrNull(v: string | undefined): string | null {
  return v === undefined || v === "" ? null : v;
}

// ─── 业务层:通用状态 ───────────────────────────────────

export const STATUS = {
  DISABLED: 0,
  ENABLED: 1,
} as const;

export type StatusValue = (typeof STATUS)[keyof typeof STATUS];

/** 状态数字 → 中文标签 */
export const STATUS_LABEL: Record<StatusValue, string> = {
  [STATUS.DISABLED]: "禁用",
  [STATUS.ENABLED]: "启用",
};

/** 状态 → badge 配色类(浅底深字) */
export const STATUS_BADGE_CLASS: Record<StatusValue, string> = {
  [STATUS.DISABLED]: "bg-danger-soft text-danger-fg",
  [STATUS.ENABLED]: "bg-success-soft text-success-fg",
};
