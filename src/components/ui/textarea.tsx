import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-18 w-full resize-y rounded-md border border-input bg-surface px-3 py-2 text-sm text-gray-900 transition-colors duration-[80ms] ease-out outline-none placeholder:text-gray-400 hover:border-gray-300 focus-visible:border-blue-500 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400 aria-invalid:border-danger-text",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
