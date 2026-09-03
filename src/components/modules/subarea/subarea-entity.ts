/** 子区域关联实体:entity_id 存的是 小区(community)/村(village)/POI 的主键 */
export const SUBAREA_ENTITY_TYPES = [
  "community",
  "village",
  "poi",
] as const;

export type SubareaEntityType = (typeof SUBAREA_ENTITY_TYPES)[number];

/** 实体类型 → 中文(表格/详情展示) */
export const SUBAREA_ENTITY_LABELS: Record<SubareaEntityType, string> = {
  community: "小区",
  village: "村",
  poi: "POI",
};

/** 后端可能存未知类型(road 等历史值):不认识的返回原文 */
export function entityTypeLabel(v: unknown): string {
  if (typeof v !== "string" || !v) return "";
  return SUBAREA_ENTITY_LABELS[v as SubareaEntityType] ?? v;
}
