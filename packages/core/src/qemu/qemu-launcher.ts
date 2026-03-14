import { spawn, type ChildProcess } from "node:child_process"
import { existsSync } from "node:fs"
import { platform } from "node:os"
import type { QemuLaunchConfig } from "../types.ts"
import { which } from "../util.ts"

const DEFAULT_QEMU = "qemu-system-i386"

/** Detect the best available QEMU display backend for the current platform. */
function detectDisplay(): string {
  switch (platform()) {
    case "darwin":
      return "cocoa"
    case "linux":
      return "gtk"
    default:
      return "sdl"
  }
}

/** Detect the best available audio backend for the current platform. */
function detectAudioBackend(): string {
  switch (platform()) {
    case "darwin":
      return "coreaudio"
    case "linux":
      return "pa"
    default:
      return "none"
  }
}

/** Detect the best available accelerator. KVM if /dev/kvm exists, otherwise TCG. */
function detectAccelerator(): string {
  if (platform() === "linux" && existsSync("/dev/kvm")) {
    return "kvm"
  }
  if (platform() === "darwin") {
    return "hvf"
  }
  return "tcg"
}

export class QemuLauncher {
  private process: ChildProcess | null = null

  /** When true, QEMU monitor goes to stdio and the process inherits the terminal. */
  interactive = false

  /** Detect the best available accelerator for the current platform. */
  static detectAccelerator = detectAccelerator

  buildArgs(config: QemuLaunchConfig): string[] {
    const args: string[] = []

    // Accelerator: explicit, or auto-detect
    args.push("-accel", config.accel ?? detectAccelerator())

    if (config.cpu) {
      args.push("-cpu", config.cpu)
    }
    if (config.smp && config.smp > 0) {
      args.push("-smp", `${Math.floor(config.smp)}`)
    }

    args.push("-machine", "pc", "-m", `${config.ram ?? 32}`, "-rtc", "base=localtime")

    // Boot disk — use snapshot=on for record/replay to discard writes
    const snapshotFlag = config.mode === "record" || config.mode === "replay" ? ",snapshot=on" : ""
    args.push("-drive", `file=${config.diskImage},format=qcow2,if=ide,index=0${snapshotFlag}`)

    // Boot from hard disk
    args.push("-boot", "order=c")

    // CD-ROM drives
    if (config.gameIso && config.sharedIso) {
      args.push("-drive", `file=${config.gameIso},media=cdrom,index=2`)
      args.push("-drive", `file=${config.sharedIso},media=cdrom,index=3`)
    } else if (config.sharedIso) {
      args.push("-drive", `file=${config.sharedIso},media=cdrom,index=2`)
    } else if (config.gameIso) {
      args.push("-drive", `file=${config.gameIso},media=cdrom,index=2`)
    }

    // Display
    if (config.mode === "headless") {
      args.push("-display", "none")
    } else {
      args.push("-display", config.display ?? detectDisplay())
    }

    if (config.vncPort) {
      args.push("-vnc", `:${config.vncPort - 5900}`)
    }
    args.push("-vga", "std")

    // Audio — SB16 device is always present so DOS games detect it;
    // headless uses a null audio backend to avoid platform audio dependency
    if (config.audio !== false) {
      const audioBackend = config.mode === "headless" ? "none" : detectAudioBackend()
      args.push(
        "-audiodev",
        `${audioBackend},id=audio0`,
        "-device",
        "sb16,audiodev=audio0,iobase=0x220,irq=5,dma=1,dma16=5",
      )
    }

    // GDB stub
    args.push("-gdb", `tcp::${config.gdbPort ?? 1234}`)

    // QMP socket
    if (config.qmpSocketPath) {
      args.push("-qmp", `unix:${config.qmpSocketPath},server,nowait`)
    }

    // Monitor — only attach to stdio when running interactively from a terminal
    if (this.interactive && (config.mode === "interactive" || config.mode === "record")) {
      args.push("-monitor", "stdio")
    } else {
      args.push("-monitor", "none")
    }

    // Serial output for headless capture
    if (config.mode === "headless" && config.serialLogPath) {
      args.push("-serial", `file:${config.serialLogPath}`)
    }

    // Record/replay
    if (config.mode === "record" && config.recordFile) {
      args.push("-icount", `shift=auto,rr=record,rrfile=${config.recordFile}`)
    } else if (config.mode === "replay" && config.recordFile) {
      args.push("-icount", `shift=auto,rr=replay,rrfile=${config.recordFile}`)
    }

    // Load snapshot at boot
    if (config.snapshot) {
      args.push("-loadvm", config.snapshot)
    }

    return args
  }

  async launch(config: QemuLaunchConfig): Promise<ChildProcess> {
    const qemuBin = which(DEFAULT_QEMU) ?? DEFAULT_QEMU
    const args = this.buildArgs(config)

    this.process = spawn(qemuBin, args, {
      stdio: this.interactive ? "inherit" : ["ignore", "ignore", "pipe"],
    })

    // Collect stderr for error reporting
    const stderrChunks: string[] = []
    if (!this.interactive && this.process.stderr) {
      this.process.stderr.on("data", (chunk: Buffer) => {
        stderrChunks.push(chunk.toString())
      })
    }

    // Wait for QEMU to either start successfully or crash.
    // Use the 'close' event (fires after stdio streams are closed) to ensure
    // we capture all stderr output before reporting errors.
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => resolve(), 1500)
      this.process!.on("close", (code) => {
        clearTimeout(timer)
        if (code !== null && code !== 0) {
          const msg =
            stderrChunks.join("").trim() ||
            "(no output captured — run in interactive mode to debug)"
          reject(new Error(`QEMU exited immediately (code ${code}):\n${msg}`))
        } else {
          resolve()
        }
      })
    })

    return this.process
  }

  waitForExit(): Promise<number | null> {
    if (!this.process) return Promise.resolve(null)
    if (this.process.exitCode !== null) return Promise.resolve(this.process.exitCode)
    return new Promise((resolve) => {
      this.process!.on("exit", (code) => resolve(code))
    })
  }

  kill(): void {
    if (this.process && this.process.exitCode === null) {
      this.process.kill()
    }
  }

  getPid(): number | undefined {
    return this.process?.pid
  }
}
