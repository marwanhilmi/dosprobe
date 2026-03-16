import { useState } from "react"
import { useMemory } from "../../hooks/useMemory"
import { hexDump } from "../../lib/hex"
import { Panel } from "../layout/Panel"
import { AddressInput } from "../shared/AddressInput"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

const SIZE_OPTIONS = [64, 128, 256, 512] as const

export function MemoryPanel() {
  const [address, setAddress] = useState("0x0")
  const [size, setSize] = useState<number>(256)
  const { data, prevData, loading, error, read, watch, unwatch, watching } = useMemory()

  function handleRead() {
    read(address, size)
  }

  function handleWatch() {
    if (watching) {
      unwatch()
    } else {
      watch(address, size)
    }
  }

  const lines = data ? hexDump(data) : []

  const toolbar = (
    <Button
      variant={watching ? "default" : "outline"}
      size="xs"
      onClick={handleWatch}
      className={watching ? "bg-info text-primary-foreground" : ""}
    >
      {watching ? "Unwatch" : "Watch"}
    </Button>
  )

  return (
    <Panel title="Memory" toolbar={toolbar}>
      <div className="flex items-center gap-2 mb-2">
        <AddressInput
          value={address}
          onChange={setAddress}
          onSubmit={handleRead}
          className="w-24"
        />
        <select
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
          className="bg-secondary border border-border rounded px-1 py-1 text-xs text-foreground h-7"
        >
          {SIZE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s} bytes
            </option>
          ))}
        </select>
        <Button variant="outline" size="xs" onClick={handleRead} disabled={loading}>
          {loading ? "..." : "Read"}
        </Button>
      </div>

      {error && <div className="text-destructive text-xs mb-2">{error}</div>}

      {lines.length > 0 ? (
        <ScrollArea className="h-[calc(100%-2rem)]">
          <div className="font-mono text-[11px] leading-[18px]">
            {lines.map((line) => (
              <div key={line.offset} className="flex">
                <span className="text-muted-foreground w-[60px] shrink-0 text-right pr-2">
                  {line.offset.toString(16).padStart(4, "0")}
                </span>
                <span className="flex-1">
                  {line.hex.map((byte, i) => {
                    const globalIdx = line.offset + i
                    const changed = prevData && data && prevData[globalIdx] !== data[globalIdx]
                    return (
                      <span
                        key={i}
                        className={`inline-block w-[22px] text-center ${changed ? "animate-flash-changed" : ""}`}
                      >
                        {byte}
                      </span>
                    )
                  })}
                  {line.hex.length < 16 && (
                    <span
                      className="inline-block"
                      style={{ width: `${(16 - line.hex.length) * 22}px` }}
                    />
                  )}
                </span>
                <span className="text-muted-foreground pl-2 shrink-0">
                  {line.ascii.split("").map((ch, i) => {
                    const globalIdx = line.offset + i
                    const changed = prevData && data && prevData[globalIdx] !== data[globalIdx]
                    return (
                      <span key={i} className={changed ? "animate-flash-changed" : ""}>
                        {ch}
                      </span>
                    )
                  })}
                </span>
              </div>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
          Enter an address and click Read
        </div>
      )}
    </Panel>
  )
}
