import type { ReactNode } from "react"
import { StatusBar } from "./StatusBar"

interface ShellProps {
  left: ReactNode
  center: ReactNode
  right: ReactNode
}

export function Shell({ left, center, right }: ShellProps) {
  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex-1 grid grid-cols-[280px_1fr_360px] gap-px bg-border min-h-0">
        {/* Left column spans full height */}
        <div className="flex flex-col bg-card overflow-auto">{left}</div>
        {/* Center column */}
        <div className="flex flex-col bg-card overflow-auto">{center}</div>
        {/* Right column */}
        <div className="flex flex-col bg-card overflow-auto">{right}</div>
      </div>
      <StatusBar />
    </div>
  )
}
