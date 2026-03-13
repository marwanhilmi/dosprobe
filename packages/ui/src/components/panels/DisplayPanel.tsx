import { useState, useMemo } from "react"
import { VncScreen } from "react-vnc"
import { useBackend } from "../../contexts/BackendContext"
import { useScreenshot } from "../../hooks/useScreenshot"
import { Panel } from "../layout/Panel"

type DisplayMode = "vnc" | "screenshot"

function ScreenshotView() {
  const { imageUrl, loading, error, capture, autoRefresh, setAutoRefresh } = useScreenshot()

  return (
    <>
      <div className="flex items-center gap-2 mb-2">
        <label className="flex items-center gap-1 text-xs text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="accent-accent-blue"
          />
          Auto
        </label>
        <button
          onClick={capture}
          disabled={loading}
          className="px-2 py-0.5 text-xs bg-bg-tertiary border border-border-default rounded hover:border-accent-blue disabled:opacity-50"
        >
          {loading ? "..." : "Capture"}
        </button>
      </div>
      {error && <div className="text-accent-red text-xs mb-2">{error}</div>}
      {imageUrl ? (
        <div className="flex items-center justify-center h-full">
          <img
            src={imageUrl}
            alt="DOS screenshot"
            className="max-w-full max-h-full"
            style={{ imageRendering: "pixelated" }}
          />
        </div>
      ) : (
        <div className="flex items-center justify-center h-full text-text-muted text-xs">
          No screenshot captured
        </div>
      )}
    </>
  )
}

export function DisplayPanel() {
  const { backend, isRunning, isPaused } = useBackend()
  const backendActive = isRunning || isPaused
  const vncAvailable = backendActive && !!backend?.vncPort
  const [mode, setMode] = useState<DisplayMode>("vnc")
  const activeMode = vncAvailable ? mode : "screenshot"

  const vncUrl = useMemo(() => {
    const proto = window.location.protocol === "https:" ? "wss" : "ws"
    return `${proto}://${window.location.host}/vnc`
  }, [])

  const toolbar = (
    <div className="flex items-center gap-1">
      {vncAvailable && (
        <>
          <button
            onClick={() => setMode("vnc")}
            className={`px-2 py-0.5 text-xs rounded border ${
              activeMode === "vnc"
                ? "bg-accent-blue/20 border-accent-blue/50 text-accent-blue"
                : "bg-bg-tertiary border-border-default text-text-secondary hover:border-text-muted"
            }`}
          >
            VNC
          </button>
          <button
            onClick={() => setMode("screenshot")}
            className={`px-2 py-0.5 text-xs rounded border ${
              activeMode === "screenshot"
                ? "bg-accent-blue/20 border-accent-blue/50 text-accent-blue"
                : "bg-bg-tertiary border-border-default text-text-secondary hover:border-text-muted"
            }`}
          >
            Screenshot
          </button>
        </>
      )}
    </div>
  )

  return (
    <Panel title="Display" toolbar={toolbar} className="flex-1 min-h-0">
      {activeMode === "vnc" ? (
        <VncScreen
          url={vncUrl}
          scaleViewport
          background="#000000"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
          }}
        />
      ) : (
        <ScreenshotView />
      )}
    </Panel>
  )
}
