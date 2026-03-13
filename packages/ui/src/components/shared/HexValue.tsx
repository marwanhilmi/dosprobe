import { clsx } from "clsx"

interface HexValueProps {
  value: string
  changed?: boolean
  className?: string
}

export function HexValue({ value, changed, className }: HexValueProps) {
  return (
    <span className={clsx("font-mono", changed && "animate-flash-changed", className)}>
      {value}
    </span>
  )
}
