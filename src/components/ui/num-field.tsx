"use client";

/**
 * 数字输入控件 —— 业务无关通用组件。
 * 受控;空串回退到 min;输入自动 clamp 到 [min, max]。
 */
import { cn } from "@/lib/utils";

import { Input } from "@/components/ui/input";

export function NumField({
  value,
  onChange,
  min,
  max,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  className?: string;
}) {
  return (
    <Input
      type="number"
      value={Number.isFinite(value) ? value : ""}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") {
          onChange(min);
          return;
        }
        const n = Number(raw);
        if (Number.isNaN(n)) return;
        onChange(Math.max(min, Math.min(max, Math.round(n))));
      }}
      min={min}
      max={max}
      className={cn("h-7 w-16 px-2 text-[12.5px] tabular-nums", className)}
    />
  );
}
