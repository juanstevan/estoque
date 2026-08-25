import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-colors duration-[80ms] ease-out outline-none select-none disabled:pointer-events-none disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-blue-700 active:bg-blue-800",
        secondary:
          "border-gray-200 bg-surface text-gray-800 shadow-xs hover:border-gray-300 hover:bg-gray-50 active:bg-gray-100 aria-expanded:bg-gray-100",
        outline:
          "border-gray-200 bg-surface text-gray-800 shadow-xs hover:border-gray-300 hover:bg-gray-50 active:bg-gray-100 aria-expanded:bg-gray-100",
        ghost:
          "text-gray-700 hover:bg-gray-100 active:bg-gray-150 aria-expanded:bg-gray-100",
        destructive:
          "bg-danger-text text-white hover:bg-[var(--danger-hover)] active:bg-[var(--danger-active)]",
        link: "text-primary underline-offset-4 hover:underline active:text-blue-800",
      },
      size: {
        default: "h-control-md px-3",
        xs: "h-control-xs px-2 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-control-sm px-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-control-lg px-4",
        icon: "size-8",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-9",
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
