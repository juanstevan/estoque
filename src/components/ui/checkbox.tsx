"use client"

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { CheckIcon, MinusIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "group/checkbox peer flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border border-gray-300 bg-surface outline-none focus-visible:border-blue-600 disabled:cursor-not-allowed disabled:opacity-50 data-checked:border-blue-600 data-checked:bg-blue-600 data-checked:text-white data-indeterminate:border-blue-600 data-indeterminate:bg-blue-600 data-indeterminate:text-white",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        keepMounted
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current opacity-0 group-data-checked/checkbox:opacity-100 group-data-indeterminate/checkbox:opacity-100"
      >
        <MinusIcon className="hidden size-2.5 stroke-[3] group-data-indeterminate/checkbox:block" />
        <CheckIcon className="size-2.5 stroke-[3] group-data-indeterminate/checkbox:hidden" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
