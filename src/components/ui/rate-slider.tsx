"use client";

/**
 * 跳过率滑块 —— 业务无关通用组件(百分比 0~100,步进 5)。
 * 附带导出 sliderNumber:把 base-ui Slider 回调值归一成 number。
 */
import { cn } from "@/lib/utils";

import { Slider } from "@/components/ui/slider";

/** 把 base-ui Slider 回调值归一成 number(兼容 number | number[]) */
export function sliderNumber(v: unknown): number {
  if (Array.isArray(v)) return Number(v[0] ?? 0);
  return Number(v ?? 0);
}

export function RateSlider({
  value,
  onChange,
  label,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="shrink-0 text-[11.5px] text-muted-foreground">{label}</span>
      <div className="w-28">
        <Slider
          value={value}
          min={0}
          max={100}
          step={5}
          onValueChange={(v) => onChange(sliderNumber(v))}
        />
      </div>
      <span className="w-9 shrink-0 text-right text-[11.5px] tabular-nums text-muted-foreground">
        {value}%
      </span>
    </div>
  );
}
