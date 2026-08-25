"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium text-gray-600 select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:text-gray-400 peer-disabled:cursor-not-allowed peer-disabled:text-gray-400",
        className
      )}
      {...props}
    />
  )
}

export { Label }
