import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-control-md w-full min-w-0 rounded-md border border-input bg-surface px-3 text-sm text-gray-900 transition-colors duration-[80ms] ease-out outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-gray-400 hover:border-gray-300 focus-visible:border-blue-500 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400 aria-invalid:border-danger-text",
        className
      )}
      {...props}
    />
  )
}

export { Input }
