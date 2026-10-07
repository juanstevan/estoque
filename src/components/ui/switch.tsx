import type { ComponentProps } from "react"
import { cn } from "@/lib/utils"

function Switch({
  checked,
  onCheckedChange,
  disabled,
  className,
  ...props
}: Omit<ComponentProps<"button">, "onChange"> & {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      data-slot="switch"
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-200 ease-in-out outline-none focus-visible:border-blue-500 disabled:cursor-not-allowed disabled:opacity-40",
        checked ? "border-primary bg-primary" : "border-gray-300 bg-gray-200",
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "pointer-events-none block size-4 rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out",
          checked ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </button>
  )
}

export { Switch }
