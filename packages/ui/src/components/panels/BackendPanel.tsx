import { useState } from "react"
import { useBackend } from "../../contexts/BackendContext"
import { selectBackend, shutdown } from "../../lib/api"
import { Panel } from "../layout/Panel"
import { ConnectionDot } from "../shared/ConnectionDot"
import { LaunchDialog } from "./LaunchDialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export function BackendPanel() {
  const { backend, refresh } = useBackend()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [selectError, setSelectError] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<"qemu" | "dosbox" | "">(backend?.type ?? "")

  const activeType = backend?.type ?? selectedType
  const isActive =
    backend?.status === "running" || backend?.status === "paused" || backend?.status === "launching"

  async function handleSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value as "qemu" | "dosbox"
    setSelectedType(value)
    setSelectError(null)
    try {
      await selectBackend(value)
      refresh()
    } catch (err) {
      setSelectError(err instanceof Error ? err.message : "Failed to select backend")
    }
  }

  async function handleStop() {
    setStopping(true)
    try {
      await shutdown()
      refresh()
    } finally {
      setStopping(false)
    }
  }

  return (
    <Panel title="Backend">
      <div className="space-y-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Backend:</span>
          <select
            value={activeType}
            onChange={handleSelect}
            disabled={isActive}
            className="bg-secondary border border-border rounded px-2 py-1 text-foreground text-xs disabled:opacity-50"
          >
            <option value="" disabled>
              Select...
            </option>
            <option value="qemu">QEMU</option>
            <option value="dosbox">DOSBox-X</option>
          </select>
        </div>

        {selectError && <div className="text-destructive text-xs">{selectError}</div>}

        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <span className="text-muted-foreground">Status:</span>
          <span className="flex items-center gap-1.5">
            <ConnectionDot status={backend?.status ?? "disconnected"} />
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
              {backend?.status ?? "disconnected"}
            </Badge>
          </span>

          {backend?.pid && (
            <>
              <span className="text-muted-foreground">PID:</span>
              <span className="font-mono">{backend.pid}</span>
            </>
          )}

          {backend?.connections?.qmp !== undefined && (
            <>
              <span className="text-muted-foreground">QMP:</span>
              <Badge
                variant={backend.connections.qmp ? "default" : "outline"}
                className="text-[10px] px-1.5 py-0 h-4 w-fit"
              >
                {backend.connections.qmp ? "connected" : "disconnected"}
              </Badge>
            </>
          )}

          {backend?.connections?.gdb !== undefined && (
            <>
              <span className="text-muted-foreground">GDB:</span>
              <Badge
                variant={backend.connections.gdb ? "default" : "outline"}
                className="text-[10px] px-1.5 py-0 h-4 w-fit"
              >
                {backend.connections.gdb ? "connected" : "disconnected"}
              </Badge>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 pt-1 border-t">
          {isActive ? (
            <Button variant="destructive" size="xs" onClick={handleStop} disabled={stopping}>
              {stopping ? "Stopping..." : "Stop"}
            </Button>
          ) : (
            <Button
              size="xs"
              onClick={() => setDialogOpen(true)}
              disabled={!activeType}
              className="bg-success/20 text-success border-success/40 hover:bg-success/30"
            >
              Launch...
            </Button>
          )}
        </div>
      </div>

      <LaunchDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        backendType={activeType || "qemu"}
      />
    </Panel>
  )
}
