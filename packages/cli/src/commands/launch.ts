import { readdirSync, existsSync } from "node:fs"
import { join } from "node:path"
import {
  QemuLauncher,
  DosboxBackend,
  resolveDosboxBinary,
  resolveDosboxOutput,
} from "@dosprobe/core"
import {
  resolveBackendType,
  resolvePaths,
  ensureDirs,
  getProjectConfig,
  defineCommand,
} from "../resolve-backend.ts"

export const launchCommand = defineCommand({
  command: "launch <mode>",
  describe: "Launch emulator",
  builder: (yargs) =>
    yargs
      .positional("mode", {
        describe: "Launch mode",
        choices: ["interactive", "headless", "debug", "record", "replay", "game"] as const,
        demandOption: true,
      })
      .option("iso", {
        describe: "Game ISO to mount",
        type: "string",
      })
      .option("exe", {
        describe: "Game executable (for game mode)",
        type: "string",
      })
      .option("snapshot", {
        describe: "Load snapshot at start",
        type: "string",
      })
      .option("rrfile", {
        alias: "replay",
        describe: "Record/replay file path (for record/replay modes)",
        type: "string",
      })
      .option("vnc-port", {
        describe: "Headless VNC port (QEMU, default: 5900)",
        type: "number",
      })
      .option("serial-log", {
        describe: "Headless serial log path (QEMU)",
        type: "string",
      })
      .option("dosbox-bin", {
        describe: "Path to DOSBox-X binary",
        type: "string",
      })
      .option("renderer", {
        describe: "DOSBox-X SDL output (e.g. surface, opengl, openglnb)",
        type: "string",
      })
      .option("ram", {
        describe: "QEMU memory in MB",
        type: "number",
      })
      .option("accel", {
        describe: "QEMU accelerator (e.g. hvf, kvm, tcg)",
        type: "string",
      })
      .option("cpu", {
        describe: "QEMU CPU model (e.g. host, max, pentium)",
        type: "string",
      })
      .option("smp", {
        describe: "QEMU virtual CPU count",
        type: "number",
      })
      .option("display", {
        describe: "QEMU display backend (e.g. gtk, cocoa, sdl, none)",
        type: "string",
      }),
  handler: async (argv) => {
    const mode = argv.mode!
    const config = getProjectConfig(argv)
    const type = resolveBackendType(argv)
    const projectDir = argv.project
    const paths = resolvePaths(projectDir, type)
    ensureDirs(paths)

    if (type === "qemu") {
      const launcher = new QemuLauncher()
      const qemuMode =
        mode === "game" ? "interactive" : (mode as "interactive" | "headless" | "record" | "replay")
      launcher.interactive = qemuMode === "interactive" || qemuMode === "record"
      const rrFile =
        argv.rrfile ??
        (qemuMode === "record" || qemuMode === "replay"
          ? join(paths.capturesDir, "game_session.rr")
          : undefined)
      const vncPort = argv["vnc-port"] ?? (qemuMode === "headless" ? 5900 : undefined)
      const serialLogPath =
        argv["serial-log"] ??
        (qemuMode === "headless" ? join(paths.capturesDir, "serial.log") : undefined)

      // Resolve game ISO: explicit --iso flag, config, or auto-detect from isos/ directory
      let gameIso = argv.iso ?? config.game?.iso
      if (!gameIso) {
        try {
          const isoFiles = readdirSync(paths.isosDir)
            .filter((f) => f.toLowerCase().endsWith(".iso"))
            .sort()
          if (isoFiles.length === 1) {
            gameIso = join(paths.isosDir, isoFiles[0]!)
            console.log(`Auto-mounting ISO: ${isoFiles[0]}`)
          } else if (isoFiles.length > 1) {
            console.log(`Multiple ISOs found in ${paths.isosDir}:`)
            for (const f of isoFiles) console.log(`  ${f}`)
            console.log("Use --iso to specify which one to mount.")
          }
        } catch {
          /* isos dir doesn't exist yet */
        }
      }

      await launcher.launch({
        type: "qemu",
        mode: qemuMode,
        diskImage: paths.diskImage,
        sharedIso: paths.sharedIso,
        gameIso,
        display: argv.display ?? config.qemu?.display,
        accel: argv.accel ?? config.qemu?.accel,
        cpu: argv.cpu ?? config.qemu?.cpu,
        smp: argv.smp ?? config.qemu?.smp,
        ram: argv.ram ?? config.qemu?.ram,
        gdbPort: config.qemu?.gdbPort,
        audio: config.qemu?.audio,
        qmpSocketPath: paths.qmpSocketPath,
        vncPort,
        serialLogPath,
        snapshot: argv.snapshot,
        recordFile: rrFile,
      })

      console.log(`QEMU launched in ${mode} mode (PID: ${launcher.getPid()})`)
      console.log(`QMP socket: ${paths.qmpSocketPath}`)
      console.log("GDB stub: localhost:1234")

      // Wait for QEMU to exit
      const exitCode = await launcher.waitForExit()
      console.log(`QEMU exited (code: ${exitCode})`)
    } else {
      const dosboxBin = resolveDosboxBinary(argv["dosbox-bin"] ?? config.dosbox?.binary)
      if (!dosboxBin) {
        console.error("DOSBox-X binary not found.")
        console.error("Set --dosbox-bin or DOSBOX_X_BIN, or install with: brew install dosbox-x")
        process.exitCode = 1
        return
      }
      const dosboxOutput = resolveDosboxOutput(argv.renderer ?? config.dosbox?.renderer)

      const backend = new DosboxBackend({
        capturesDir: paths.capturesDir,
        confDir: paths.confDir,
        driveCPath: paths.driveCPath,
        statesDir: paths.statesDir,
        dosboxBin,
        dosboxOutput,
      })

      const dosboxMode =
        mode === "headless" || mode === "record" || mode === "replay"
          ? "interactive"
          : (mode as "interactive" | "debug" | "game" | "capture")
      const baseConfigPath = join(paths.confDir, "dosbox-x.conf")

      await backend.launch({
        type: "dosbox",
        mode: dosboxMode,
        driveCPath: paths.driveCPath,
        gameExe: argv.exe ?? config.game?.exe,
        gameIso: argv.iso ?? config.game?.iso,
        startDebugger: mode === "debug",
        configPath: existsSync(baseConfigPath) ? baseConfigPath : undefined,
        dosboxBin,
        output: dosboxOutput,
      })

      console.log(`DOSBox-X launched in ${mode} mode`)
      console.log(`  Binary: ${dosboxBin}`)
      console.log(`  Renderer: ${dosboxOutput}`)
      if (existsSync(baseConfigPath)) {
        console.log(`  Base config: ${baseConfigPath}`)
      }
      console.log(`  Log: ${join(paths.capturesDir, "dosbox-x.log")}`)
    }
  },
})
