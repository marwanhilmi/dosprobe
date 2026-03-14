import { useState } from "react"
import { Panel } from "../layout/Panel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { sendKeys } from "../../lib/api"
import { useBackend } from "../../contexts/BackendContext"

const COMMON_KEYS = [
  { label: "Enter", key: "ret" },
  { label: "Esc", key: "esc" },
  { label: "Space", key: "spc" },
  { label: "Tab", key: "tab" },
  { label: "←", key: "left" },
  { label: "→", key: "right" },
  { label: "↑", key: "up" },
  { label: "↓", key: "down" },
  { label: "Y", key: "y" },
  { label: "N", key: "n" },
] as const

const FUNCTION_KEYS = ["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10", "f11", "f12"] as const

export function KeyboardPanel() {
  const { isRunning, isPaused } = useBackend()
  const active = isRunning || isPaused
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSend(keys: string[]) {
    if (!active || keys.length === 0) return
    setSending(true)
    setError(null)
    try {
      await sendKeys(keys)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send keys")
    } finally {
      setSending(false)
    }
  }

  async function handleSendText() {
    if (!text.trim()) return
    // Convert text characters to QEMU key names
    const keys = text.split("").map((ch) => {
      if (ch === " ") return "spc"
      if (ch === "\n" || ch === "\r") return "ret"
      if (ch === "\t") return "tab"
      return ch.toLowerCase()
    })
    await handleSend(keys)
    setText("")
  }

  return (
    <Panel title="Keyboard">
      <div className="space-y-3 text-xs">
        {/* Text input for arbitrary text */}
        <div className="flex items-center gap-1">
          <Input
            className="h-7 text-xs flex-1 font-mono"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleSendText()
              }
            }}
            placeholder="type text to send..."
            disabled={!active || sending}
          />
          <Button
            variant="outline"
            size="xs"
            onClick={handleSendText}
            disabled={!active || sending || !text.trim()}
          >
            Send
          </Button>
        </div>

        {error && <div className="text-destructive text-xs">{error}</div>}

        {/* Common keys */}
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
            Common
          </div>
          <div className="flex flex-wrap gap-1">
            {COMMON_KEYS.map(({ label, key }) => (
              <Button
                key={key}
                variant="outline"
                size="xs"
                onClick={() => handleSend([key])}
                disabled={!active || sending}
                className="min-w-[2rem]"
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        {/* Function keys */}
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
            Function Keys
          </div>
          <div className="flex flex-wrap gap-1">
            {FUNCTION_KEYS.map((key) => (
              <Button
                key={key}
                variant="outline"
                size="xs"
                onClick={() => handleSend([key])}
                disabled={!active || sending}
                className="min-w-[2rem]"
              >
                {key.toUpperCase()}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  )
}
