"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn("group/tabs flex gap-4 data-horizontal:flex-col", className)}
      {...props}
    />
  )
}

/**
 * `line` is navigation: underline, 36px, hairline under the whole row.
 * `default` is a segmented control — view modes only (List / Board / Calendar).
 */
const tabsListVariants = cva(
  "group/tabs-list inline-flex items-center group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col",
  {
    variants: {
      variant: {
        default:
          "w-fit justify-center rounded-md bg-gray-100 p-[3px] group-data-horizontal/tabs:h-control-md",
        line: "w-full justify-start gap-6 border-b border-border group-data-horizontal/tabs:h-9",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex items-center justify-center gap-1.5 text-sm font-medium whitespace-nowrap text-gray-600 transition-colors duration-[80ms] ease-out outline-none hover:text-gray-900 disabled:pointer-events-none disabled:text-gray-400 aria-disabled:pointer-events-none aria-disabled:text-gray-400 data-active:text-gray-900 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        // Segmented control: white thumb on the sunken track.
        "group-data-[variant=default]/tabs-list:h-[calc(100%-1px)] group-data-[variant=default]/tabs-list:flex-1 group-data-[variant=default]/tabs-list:rounded-[4px] group-data-[variant=default]/tabs-list:px-3 group-data-[variant=default]/tabs-list:data-active:bg-surface group-data-[variant=default]/tabs-list:data-active:shadow-xs",
        // Underline navigation: 2px accent bar sitting on the row's hairline.
        "group-data-[variant=line]/tabs-list:h-full",
        "after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary after:opacity-0 after:transition-opacity after:duration-[120ms] group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
