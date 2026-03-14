import { useState } from "react"
import { useExecution } from "../../hooks/useExecution"
import { useBreakpoints } from "../../hooks/useBreakpoints"
import { useBackend } from "../../contexts/BackendContext"
import { Panel } from "../layout/Panel"
import { AddressInput } from "../shared/AddressInput"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import type { BreakpointType } from "../../types/api"
import { cn } from "@/lib/utils"

export function DebuggerPanel() {
  const { pause, resume, step, busy } = useExecution()
  const { breakpoints, activeBreakpointId, add, remove } = useBreakpoints()
  const { isRunning, isPaused } = useBackend()

  const [bpAddress, setBpAddress] = useState("")
  const [bpType, setBpType] = useState<BreakpointType>("execution")

  async function handleAddBreakpoint() {
    if (!bpAddress.trim()) return
    await add(bpType, bpAddress.trim())
    setBpAddress("")
  }

  return (
    <Panel title="Debugger">
      <div className="space-y-3">
        {/* Control buttons */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="xs" onClick={() => pause()} disabled={busy || !isRunning}>
            Pause
          </Button>
          <Button
            size="xs"
            onClick={() => resume()}
            disabled={busy || !isPaused}
            className="bg-success/20 text-success border-success/40 hover:bg-success/30"
          >
            Resume
          </Button>
          <Button
            variant="outline"
            size="xs"
            onClick={() => step()}
            disabled={busy || !isPaused}
            className="text-warning border-warning/40 hover:bg-warning/20"
          >
            Step
          </Button>
        </div>

        <Separator />

        {/* Breakpoints */}
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
            Breakpoints
          </div>
          <div className="flex items-center gap-1 mb-2">
            <select
              value={bpType}
              onChange={(e) => setBpType(e.target.value as BreakpointType)}
              className="bg-secondary border border-border rounded px-1 py-1 text-xs text-foreground h-7"
            >
              <option value="execution">exec</option>
              <option value="memory">mem</option>
              <option value="interrupt">int</option>
            </select>
            <AddressInput
              value={bpAddress}
              onChange={setBpAddress}
              onSubmit={handleAddBreakpoint}
              placeholder="address"
              className="flex-1"
            />
            <Button variant="outline" size="xs" onClick={handleAddBreakpoint}>
              +
            </Button>
          </div>

          {breakpoints.length === 0 ? (
            <div className="text-muted-foreground text-xs">No breakpoints set</div>
          ) : (
            <div className="space-y-0.5">
              {breakpoints.map((bp) => (
                <div
                  key={bp.id}
                  className={cn(
                    "flex items-center justify-between px-2 py-0.5 rounded text-xs",
                    bp.id === activeBreakpointId
                      ? "bg-warning/20 border border-warning/50"
                      : "hover:bg-accent",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                      {bp.type.slice(0, 4)}
                    </Badge>
                    <span className="font-mono">
                      {bp.address
                        ? `${bp.address.segOff.segment.toString(16)}:${bp.address.segOff.offset.toString(16)}`
                        : bp.interrupt !== undefined
                          ? `INT ${bp.interrupt.toString(16)}h${bp.ah !== undefined ? ` AH=${bp.ah.toString(16)}h` : ""}`
                          : bp.id}
                    </span>
                    {bp.id === activeBreakpointId && (
                      <Badge className="text-[10px] px-1 py-0 h-4 bg-warning text-warning-foreground">
                        HIT
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => remove(bp.id)}
                    className="text-muted-foreground hover:text-destructive h-5 w-5"
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Panel>
  )
}
