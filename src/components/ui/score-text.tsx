import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const PLACEHOLDER_EMPTY = "—";

/** 0-10 评分对应的徽标配色:高(绿)/中(琥珀)/低(红) */
function scoreClassName(n: number): string {
  if (n >= 8) return "bg-emerald-500/15 text-emerald-600 border-transparent";
  if (n >= 5) return "bg-amber-500/15 text-amber-600 border-transparent";
  return "bg-red-500/15 text-red-600 border-transparent";
}

/**
 * 标准化评分徽章(0-10,一位小数)。
 * null/空/非数字 → 占位符;否则按分数档位着色渲染为 Badge。
 */
export function ScoreText({
  value,
  className,
}: {
  value: unknown;
  className?: string;
}) {
  if (value === null || value === undefined || value === "") {
    return (
      <span className={cn("font-mono text-[12px] text-muted-foreground", className)}>
        {PLACEHOLDER_EMPTY}
      </span>
    );
  }
  const n = Number(value);
  if (Number.isNaN(n)) {
    return (
      <span className={cn("font-mono text-[12px] text-muted-foreground", className)}>
        {PLACEHOLDER_EMPTY}
      </span>
    );
  }
  return (
    <Badge className={cn(scoreClassName(n), className)}>{n.toFixed(1)}</Badge>
  );
}
