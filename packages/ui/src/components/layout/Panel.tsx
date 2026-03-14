import type { ReactNode } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface PanelProps {
  title: string
  toolbar?: ReactNode
  children: ReactNode
  className?: string
}

export function Panel({ title, toolbar, children, className }: PanelProps) {
  return (
    <Card className={cn("flex flex-col rounded-none border-0 border-b last:border-b-0", className)}>
      <CardHeader className="flex flex-row items-center justify-between px-3 py-1.5 space-y-0 border-b shrink-0">
        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {title}
        </CardTitle>
        {toolbar && <div className="flex items-center gap-1">{toolbar}</div>}
      </CardHeader>
      <CardContent className="flex-1 overflow-auto p-2 relative min-h-0">{children}</CardContent>
    </Card>
  )
}
