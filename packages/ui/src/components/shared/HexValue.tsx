import { cn } from "@/lib/utils"

interface HexValueProps {
  value: string
  changed?: boolean
  className?: string
}

export function HexValue({ value, changed, className }: HexValueProps) {
  return (
    <span className={cn("font-mono", changed && "animate-flash-changed", className)}>{value}</span>
  )
}
