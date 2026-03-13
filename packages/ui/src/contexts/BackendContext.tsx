import { createContext, useCallback, useContext, useEffect, useState } from "react"
import type { ReactNode } from "react"
import type { BackendInfo, BackendResponse } from "../types/api"
import { getBackend } from "../lib/api"
import { useWebSocket } from "./WebSocketContext"

interface BackendContextValue {
  backend: BackendInfo | null
  isRunning: boolean
  isPaused: boolean
  refresh: () => void
}

const BackendContext = createContext<BackendContextValue | null>(null)

const POLL_INTERVAL = 5000

function normalizeBackend(backend: BackendResponse): BackendInfo | null {
  return backend.type === null ? null : backend
}

export function BackendProvider({ children }: { children: ReactNode }) {
  const [backend, setBackend] = useState<BackendInfo | null>(null)
  const { onMessage, send, connected } = useWebSocket()

  const refresh = useCallback(() => {
    getBackend()
      .then((info) => setBackend(normalizeBackend(info)))
      .catch(() => {
        setBackend(null)
      })
  }, [])

  // Initial fetch + polling
  useEffect(() => {
    refresh()
    const id = setInterval(refresh, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [refresh])

  // Sync immediately after WS reconnect
  useEffect(() => {
    if (connected) {
      refresh()
    }
  }, [connected, refresh])

  // Subscribe to WS status channel
  useEffect(() => {
    if (!connected) return
    const unsub = onMessage((msg) => {
      if (msg.type === "status:changed") {
        setBackend(msg.backend)
      }
    })
    send({ type: "subscribe", channel: "status" })

    return () => {
      send({ type: "unsubscribe", channel: "status" })
      unsub()
    }
  }, [connected, send, onMessage])

  const isRunning = backend?.status === "running"
  const isPaused = backend?.status === "paused"

  return (
    <BackendContext.Provider value={{ backend, isRunning, isPaused, refresh }}>
      {children}
    </BackendContext.Provider>
  )
}

export function useBackend(): BackendContextValue {
  const ctx = useContext(BackendContext)
  if (!ctx) throw new Error("useBackend must be used within BackendProvider")
  return ctx
}
