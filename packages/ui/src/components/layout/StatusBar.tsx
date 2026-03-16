import { useBackend } from "../../contexts/BackendContext"
import { useWebSocket } from "../../contexts/WebSocketContext"
import { Badge } from "@/components/ui/badge"
import { ConnectionDot } from "../shared/ConnectionDot"

export function StatusBar() {
  const { backend } = useBackend()
  const { connected } = useWebSocket()

  return (
    <div className="flex items-center gap-4 px-3 py-1 bg-card border-t text-xs text-muted-foreground">
      <div className="flex items-center gap-1.5">
        <ConnectionDot status={backend?.status ?? "disconnected"} />
        <span className="font-medium">{backend?.type ?? "no backend"}</span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
          {backend?.status ?? "disconnected"}
        </Badge>
      </div>

      {backend?.connections && (
        <div className="flex items-center gap-2">
          {backend.connections.qmp !== undefined && (
            <span className={backend.connections.qmp ? "text-success" : "text-muted-foreground"}>
              QMP {backend.connections.qmp ? "✓" : "✗"}
            </span>
          )}
          {backend.connections.gdb !== undefined && (
            <span className={backend.connections.gdb ? "text-success" : "text-muted-foreground"}>
              GDB {backend.connections.gdb ? "✓" : "✗"}
            </span>
          )}
        </div>
      )}

      {backend?.pid && <span className="text-muted-foreground">PID {backend.pid}</span>}

      <div className="ml-auto flex items-center gap-1.5">
        <ConnectionDot status={connected ? "connected" : "disconnected"} />
        <span>WS {connected ? "connected" : "disconnected"}</span>
      </div>
    </div>
  )
}
