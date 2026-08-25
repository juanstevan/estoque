import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Fill, border and text always travel together — a status is never a bare tint.
 * Squared corners (4px) rather than pills; rounded pills read consumer.
 */
const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-sm border px-2 text-xs font-medium whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        neutral: "border-gray-200 bg-gray-100 text-gray-700",
        info: "border-info-border bg-info-fill text-info-text",
        success: "border-success-border bg-success-fill text-success-text",
        warning: "border-warning-border bg-warning-fill text-warning-text",
        danger: "border-danger-border bg-danger-fill text-danger-text",
        /** Not a status — categories, teams, product lines. Only the dot carries hue. */
        tag: "border-gray-200 bg-surface text-gray-700",
      },
      size: {
        default: "h-5",
        md: "h-6",
      },
    },
    defaultVariants: {
      variant: "neutral",
      size: "default",
    },
  }
)

function Badge({
  className,
  variant = "neutral",
  size = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant, size }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

/** 6px dot in the current text color, or an explicit hue for tag chips. */
function BadgeDot({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      className={cn("size-1.5 shrink-0 rounded-full bg-current", className)}
      {...props}
    />
  )
}

export { Badge, BadgeDot, badgeVariants }
