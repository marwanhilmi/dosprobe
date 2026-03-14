import { cn } from "@/lib/utils"

const colorMap = {
  connected: "bg-success",
  running: "bg-success",
  paused: "bg-warning",
  launching: "bg-info animate-pulse",
  disconnected: "bg-muted-foreground",
  error: "bg-destructive",
} as const

type DotStatus = keyof typeof colorMap

export function ConnectionDot({ status, className }: { status: DotStatus; className?: string }) {
  return <span className={cn("inline-block h-2 w-2 rounded-full", colorMap[status], className)} />
}
