import { useEffect, useRef, useState } from "react"
import type { DosboxLaunchConfig, QemuLaunchConfig } from "../../types/api"
import { launch, selectBackend, getLaunchDefaults } from "../../lib/api"
import { useBackend } from "../../contexts/BackendContext"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"

interface LaunchDialogProps {
  open: boolean
  onClose: () => void
  backendType: "qemu" | "dosbox"
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-center gap-2">
      <Label className="text-xs text-right">{label}</Label>
      <div>{children}</div>
    </div>
  )
}

function QemuForm({
  config,
  onChange,
}: {
  config: QemuLaunchConfig
  onChange: (c: QemuLaunchConfig) => void
}) {
  function set<K extends keyof QemuLaunchConfig>(key: K, value: QemuLaunchConfig[K]) {
    onChange({ ...config, [key]: value })
  }

  return (
    <div className="space-y-2">
      <Field label="Mode">
        <select
          className="w-full bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground h-7"
          value={config.mode}
          onChange={(e) => set("mode", e.target.value as QemuLaunchConfig["mode"])}
        >
          <option value="interactive">Interactive</option>
          <option value="headless">Headless</option>
          <option value="record">Record</option>
          <option value="replay">Replay</option>
        </select>
      </Field>
      <Field label="Disk Image *">
        <Input
          className="h-7 text-xs"
          value={config.diskImage}
          onChange={(e) => set("diskImage", e.target.value)}
          placeholder="/path/to/disk.img"
        />
      </Field>
      <Field label="Shared ISO">
        <Input
          className="h-7 text-xs"
          value={config.sharedIso ?? ""}
          onChange={(e) => set("sharedIso", e.target.value || undefined)}
          placeholder="/path/to/shared.iso"
        />
      </Field>
      <Field label="Game ISO">
        <Input
          className="h-7 text-xs"
          value={config.gameIso ?? ""}
          onChange={(e) => set("gameIso", e.target.value || undefined)}
          placeholder="/path/to/game.iso"
        />
      </Field>
      <Field label="Display">
        <Input
          className="h-7 text-xs"
          value={config.display ?? ""}
          onChange={(e) => set("display", e.target.value || undefined)}
          placeholder="e.g. gtk, cocoa, sdl, none"
        />
      </Field>
      <Field label="RAM (MB)">
        <Input
          className="h-7 text-xs"
          type="number"
          value={config.ram ?? 64}
          onChange={(e) => set("ram", Number(e.target.value) || undefined)}
        />
      </Field>
      <Field label="CPU">
        <Input
          className="h-7 text-xs"
          value={config.cpu ?? ""}
          onChange={(e) => set("cpu", e.target.value || undefined)}
          placeholder="e.g. 486"
        />
      </Field>
      <Field label="Accelerator">
        <Input
          className="h-7 text-xs"
          value={config.accel ?? ""}
          onChange={(e) => set("accel", e.target.value || undefined)}
          placeholder="e.g. hvf, kvm, tcg"
        />
      </Field>
      <Field label="GDB Port">
        <Input
          className="h-7 text-xs"
          type="number"
          value={config.gdbPort ?? 1234}
          onChange={(e) => set("gdbPort", Number(e.target.value) || undefined)}
        />
      </Field>
      <Field label="QMP Socket">
        <Input
          className="h-7 text-xs"
          value={config.qmpSocketPath ?? ""}
          onChange={(e) => set("qmpSocketPath", e.target.value || undefined)}
          placeholder="/tmp/qmp.sock"
        />
      </Field>
      <Field label="VNC Port">
        <Input
          className="h-7 text-xs"
          type="number"
          value={config.vncPort ?? ""}
          onChange={(e) => set("vncPort", Number(e.target.value) || undefined)}
        />
      </Field>
      <Field label="Snapshot">
        <Input
          className="h-7 text-xs"
          value={config.snapshot ?? ""}
          onChange={(e) => set("snapshot", e.target.value || undefined)}
          placeholder="snapshot name"
        />
      </Field>
      <Field label="Audio">
        <Checkbox
          checked={config.audio ?? true}
          onCheckedChange={(checked) => set("audio", !!checked)}
        />
      </Field>
    </div>
  )
}

function DosboxForm({
  config,
  onChange,
}: {
  config: DosboxLaunchConfig
  onChange: (c: DosboxLaunchConfig) => void
}) {
  function set<K extends keyof DosboxLaunchConfig>(key: K, value: DosboxLaunchConfig[K]) {
    onChange({ ...config, [key]: value })
  }

  return (
    <div className="space-y-2">
      <Field label="Mode">
        <select
          className="w-full bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground h-7"
          value={config.mode}
          onChange={(e) => set("mode", e.target.value as DosboxLaunchConfig["mode"])}
        >
          <option value="interactive">Interactive</option>
          <option value="debug">Debug</option>
          <option value="game">Game</option>
          <option value="capture">Capture</option>
        </select>
      </Field>
      <Field label="Drive C Path *">
        <Input
          className="h-7 text-xs"
          value={config.driveCPath}
          onChange={(e) => set("driveCPath", e.target.value)}
          placeholder="/path/to/drive_c"
        />
      </Field>
      <Field label="Game Executable">
        <Input
          className="h-7 text-xs"
          value={config.gameExe ?? ""}
          onChange={(e) => set("gameExe", e.target.value || undefined)}
          placeholder="GAME.EXE"
        />
      </Field>
      <Field label="Game ISO">
        <Input
          className="h-7 text-xs"
          value={config.gameIso ?? ""}
          onChange={(e) => set("gameIso", e.target.value || undefined)}
          placeholder="/path/to/game.iso"
        />
      </Field>
      <Field label="DOSBox-X Binary">
        <Input
          className="h-7 text-xs"
          value={config.dosboxBin ?? ""}
          onChange={(e) => set("dosboxBin", e.target.value || undefined)}
          placeholder="dosbox-x"
        />
      </Field>
      <Field label="Output">
        <Input
          className="h-7 text-xs"
          value={config.output ?? ""}
          onChange={(e) => set("output", e.target.value || undefined)}
          placeholder="e.g. surface"
        />
      </Field>
      <Field label="Start Debugger">
        <Checkbox
          checked={config.startDebugger ?? false}
          onCheckedChange={(checked) => set("startDebugger", !!checked)}
        />
      </Field>
    </div>
  )
}

const DEFAULT_QEMU: QemuLaunchConfig = {
  type: "qemu",
  mode: "interactive",
  diskImage: "",
  audio: true,
  vncPort: 5900,
}

const DEFAULT_DOSBOX: DosboxLaunchConfig = {
  type: "dosbox",
  mode: "interactive",
  driveCPath: "",
}

export function LaunchDialog({ open, onClose, backendType }: LaunchDialogProps) {
  const { refresh } = useBackend()

  const [qemuConfig, setQemuConfig] = useState<QemuLaunchConfig>(DEFAULT_QEMU)
  const [dosboxConfig, setDosboxConfig] = useState<DosboxLaunchConfig>(DEFAULT_DOSBOX)
  const [error, setError] = useState<string | null>(null)
  const [launching, setLaunching] = useState(false)
  const defaultsLoaded = useRef(false)

  useEffect(() => {
    if (defaultsLoaded.current) return
    defaultsLoaded.current = true
    getLaunchDefaults()
      .then((defaults) => {
        setQemuConfig((prev) => ({
          ...prev,
          diskImage: prev.diskImage || defaults.qemu.diskImage,
          sharedIso: prev.sharedIso || defaults.qemu.sharedIso,
          gameIso: prev.gameIso || defaults.qemu.gameIso,
          qmpSocketPath: prev.qmpSocketPath || defaults.qemu.qmpSocketPath,
          ram: prev.ram ?? defaults.qemu.ram,
          display: prev.display ?? defaults.qemu.display,
          audio: prev.audio ?? defaults.qemu.audio ?? true,
          gdbPort: prev.gdbPort ?? defaults.qemu.gdbPort,
          accel: prev.accel || defaults.qemu.accel,
          cpu: prev.cpu || defaults.qemu.cpu,
          smp: prev.smp ?? defaults.qemu.smp,
        }))
        setDosboxConfig((prev) => ({
          ...prev,
          driveCPath: prev.driveCPath || defaults.dosbox.driveCPath,
          gameExe: prev.gameExe || defaults.dosbox.gameExe,
          gameIso: prev.gameIso || defaults.dosbox.gameIso,
          dosboxBin: prev.dosboxBin || defaults.dosbox.dosboxBin,
          output: prev.output || defaults.dosbox.output,
        }))
      })
      .catch(() => {
        /* server may not have defaults configured */
      })
  }, [])

  async function handleLaunch() {
    setError(null)
    setLaunching(true)
    const config = backendType === "qemu" ? qemuConfig : dosboxConfig

    if (backendType === "qemu" && !qemuConfig.diskImage.trim()) {
      setError("Disk image path is required")
      setLaunching(false)
      return
    }
    if (backendType === "dosbox" && !dosboxConfig.driveCPath.trim()) {
      setError("Drive C path is required")
      setLaunching(false)
      return
    }

    try {
      await selectBackend(backendType)
      await launch(config)
      refresh()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Launch failed")
    } finally {
      setLaunching(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-130 max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Launch {backendType === "qemu" ? "QEMU" : "DOSBox-X"}</DialogTitle>
          <DialogDescription>Configure emulator settings and launch.</DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 py-2">
          {backendType === "qemu" ? (
            <QemuForm config={qemuConfig} onChange={setQemuConfig} />
          ) : (
            <DosboxForm config={dosboxConfig} onChange={setDosboxConfig} />
          )}
        </div>

        {error && <div className="text-destructive text-xs px-1">{error}</div>}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleLaunch} disabled={launching}>
            {launching ? "Launching..." : "Launch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
