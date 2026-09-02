/**
 * Label.data 摘要工具 —— 列表列与详情弹窗共用。
 * 输入为 label.data 统一配置 JSON(4 数据源 + prefix/suffix + skipRate),只渲染数据源部分。
 */

/** 把 label.data 的数据源部分渲染成简短摘要,如:randomValue·road customValue·3项 randomNumber·arabic(1~4位) randomChinese·2~4字 */
export function summarizeLabelDataSources(data: unknown): string {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "未配置";
  const d = data as {
    randomValue?: { name?: string };
    customValue?: { list?: unknown[] };
    randomNumber?: { format?: string; minDigits?: number; maxDigits?: number };
    randomChinese?: { minLength?: number; maxLength?: number };
  };
  const parts: string[] = [];
  if (d.randomValue?.name) parts.push(`randomValue·${d.randomValue.name}`);
  if (d.customValue?.list) parts.push(`customValue·${d.customValue.list.length}项`);
  if (d.randomNumber)
    parts.push(
      `randomNumber·${d.randomNumber.format ?? "arabic"}(${d.randomNumber.minDigits ?? 1}~${d.randomNumber.maxDigits ?? 4}位)`,
    );
  if (d.randomChinese)
    parts.push(
      `randomChinese·${d.randomChinese.minLength ?? 2}~${d.randomChinese.maxLength ?? 4}字`,
    );
  return parts.length > 0 ? parts.join("  ") : "未配置";
}

/** 整体跳过率摘要(>0 才展示) */
export function summarizeSkipRate(skipRate: unknown): string {
  if (typeof skipRate !== "number" || skipRate <= 0) return "";
  return `跳过${skipRate}%`;
}

/** 干扰率摘要(>0 才展示) */
export function summarizeNoiseRate(noiseRate: unknown): string {
  if (typeof noiseRate !== "number" || noiseRate <= 0) return "";
  return `干扰${noiseRate}%`;
}
