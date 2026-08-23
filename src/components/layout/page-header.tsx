import { cn } from "@/lib/utils";

/**
 * 标准页面头部：标题 + 描述 + 操作按钮。
 * Apple 风格：标题 28px / 500 + 宽松间距。
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 pb-5", className)}>
      <div className="min-w-0">
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
