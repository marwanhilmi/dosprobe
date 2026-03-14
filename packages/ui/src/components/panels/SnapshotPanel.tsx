import { useState, useCallback, useEffect } from "react"
import { Panel } from "../layout/Panel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useBackend } from "../../contexts/BackendContext"
import type { Snapshot } from "../../types/api"

const API_BASE = "/api"

async function listSnapshots(): Promise<Snapshot[]> {
  const res = await fetch(`${API_BASE}/snapshots`)
  if (!res.ok) throw new Error("Failed to list snapshots")
  const data = (await res.json()) as { snapshots: Snapshot[] }
  return data.snapshots
}

async function saveSnapshot(name: string): Promise<Snapshot> {
  const res = await fetch(`${API_BASE}/snapshots`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) throw new Error("Failed to save snapshot")
  return res.json() as Promise<Snapshot>
}

async function loadSnapshot(name: string): Promise<void> {
  const res = await fetch(`${API_BASE}/snapshots/${encodeURIComponent(name)}/load`, {
    method: "POST",
  })
  if (!res.ok) throw new Error("Failed to load snapshot")
}

export function SnapshotPanel() {
  const { isRunning, isPaused } = useBackend()
  const active = isRunning || isPaused
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [newName, setNewName] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    if (!active) return
    setLoading(true)
    listSnapshots()
      .then(setSnapshots)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [active])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function handleSave() {
    if (!newName.trim()) return
    setError(null)
    try {
      await saveSnapshot(newName.trim())
      setNewName("")
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    }
  }

  async function handleLoad(name: string) {
    setError(null)
    try {
      await loadSnapshot(name)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed")
    }
  }

  const toolbar = (
    <Button variant="outline" size="xs" onClick={refresh} disabled={loading || !active}>
      {loading ? "..." : "Refresh"}
    </Button>
  )

  return (
    <Panel title="Snapshots" toolbar={toolbar}>
      <div className="space-y-2 text-xs">
        <div className="flex items-center gap-1">
          <Input
            className="h-7 text-xs flex-1"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder="snapshot name"
            disabled={!active}
          />
          <Button variant="outline" size="xs" onClick={handleSave} disabled={!active || !newName.trim()}>
            Save
          </Button>
        </div>

        {error && <div className="text-destructive text-xs">{error}</div>}

        {snapshots.length === 0 ? (
          <div className="text-muted-foreground text-xs py-2">
            {active ? "No snapshots" : "Connect to view snapshots"}
          </div>
        ) : (
          <div className="space-y-0.5">
            {snapshots.map((snap) => (
              <div
                key={snap.name}
                className="flex items-center justify-between px-2 py-1 rounded hover:bg-accent"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                    {snap.backend}
                  </Badge>
                  <span className="font-mono">{snap.name}</span>
                </div>
                <Button variant="ghost" size="xs" onClick={() => handleLoad(snap.name)}>
                  Load
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  )
}
