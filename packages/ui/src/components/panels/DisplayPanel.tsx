import { useState, useMemo } from "react"
import { VncScreen } from "react-vnc"
import { useBackend } from "../../contexts/BackendContext"
import { useScreenshot } from "../../hooks/useScreenshot"
import { Panel } from "../layout/Panel"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

type DisplayMode = "vnc" | "screenshot"

function ScreenshotView() {
  const { imageUrl, loading, error, capture, autoRefresh, setAutoRefresh } = useScreenshot()

  return (
    <>
      <div className="flex items-center gap-3 mb-2">
        <div className="flex items-center gap-1.5">
          <Checkbox
            id="auto-refresh"
            checked={autoRefresh}
            onCheckedChange={(checked) => setAutoRefresh(!!checked)}
          />
          <Label htmlFor="auto-refresh" className="text-xs cursor-pointer">
            Auto
          </Label>
        </div>
        <Button variant="outline" size="xs" onClick={capture} disabled={loading}>
          {loading ? "..." : "Capture"}
        </Button>
      </div>
      {error && <div className="text-destructive text-xs mb-2">{error}</div>}
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
        <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
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

  const toolbar = vncAvailable ? (
    <Tabs value={activeMode} onValueChange={(v) => setMode(v as DisplayMode)}>
      <TabsList className="h-6">
        <TabsTrigger value="vnc" className="text-[10px] px-2 h-5">
          VNC
        </TabsTrigger>
        <TabsTrigger value="screenshot" className="text-[10px] px-2 h-5">
          Screenshot
        </TabsTrigger>
      </TabsList>
    </Tabs>
  ) : undefined

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
