import { format } from "date-fns";

/**
 * 日期格式化工具 —— 统一走 date-fns。
 * ponytail: 全项目日期输出只用这一处,避免各组件手写 toLocaleDateString。
 */

/** 短日期:2026-08-21 */
export function fmtShortDate(d: Date | string | number): string {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  return format(date, "yyyy-MM-dd");
}

/** 短日期 + 时分:2026-08-21 14:30 */
export function fmtDateTime(d: Date | string | number): string {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  return format(date, "yyyy-MM-dd HH:mm");
}

/** 完整时间:2026-08-21 14:30:00 */
export function fmtFullDateTime(d: Date | string | number): string {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  return format(date, "yyyy-MM-dd HH:mm:ss");
}