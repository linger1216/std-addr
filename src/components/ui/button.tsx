import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-2xl border border-transparent bg-clip-padding text-[14px] font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        /* Apple 胶囊：近黑底白字，圆角极大 */
        default:
          "bg-primary text-primary-foreground hover:bg-[#2d2d2f] active:bg-[#3d3d3f]",
        /* 幽灵：极轻灰底黑字，Apple ghost style */
        ghost:
          "hover:bg-muted aria-expanded:bg-muted text-foreground",
        /* 次级：浅灰底 */
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[#e8e8ed] aria-expanded:bg-secondary",
        /* 描边：白色底 hairline 边框 */
        outline:
          "border-border bg-background hover:bg-muted text-foreground aria-expanded:bg-muted",
        /* 危险：Apple 红底 */
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30",
        /* 文字链接 */
        link: "text-[#0066cc] underline-offset-4 hover:underline",
      },
      size: {
        /* sm: 32px 高，圆角 10px */
        sm: "h-8 gap-1.5 rounded-xl px-3.5 text-[13px] [&_svg:not([class*='size-'])]:size-3.5",
        /* default: 36px 高，圆角 14px */
        default: "h-9 gap-2 px-4 [&_svg:not([class*='size-'])]:size-4",
        /* lg: 42px 高，圆角 16px */
        lg: "h-[42px] gap-2 px-5 text-[15px] [&_svg:not([class*='size-'])]:size-4",
        /* icon: 32px 方 */
        "icon-sm": "size-8 rounded-xl",
        /* icon default: 36px 方 */
        icon: "size-9 rounded-xl",
        /* icon lg: 42px 方 */
        "icon-lg": "size-[42px] rounded-2xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
