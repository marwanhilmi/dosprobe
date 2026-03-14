import { execSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs"
import { basename, extname, join } from "node:path"
import { tmpdir } from "node:os"
import { CONFIG_FILENAME, QemuLauncher, writeProjectConfig, which } from "@dosprobe/core"
import type { ProjectConfig } from "@dosprobe/core"
import { resolvePaths, ensureDirs, defineCommand } from "../resolve-backend.ts"

function step(n: number, msg: string): void {
  console.log(`\n[${"=".repeat(n)}] ${msg}`)
}

export const bootstrapCommand = defineCommand({
  command: "bootstrap",
  describe: "One-step project setup: init, setup backend, fetch game, and optionally launch",
  builder: (yargs) =>
    yargs
      .option("game-url", {
        describe: "URL of game archive (ZIP with ISO) to download",
        type: "string",
      })
      .option("headless", {
        describe: "Launch QEMU in headless mode with VNC",
        type: "boolean",
        default: false,
      })
      .option("launch", {
        describe: "Launch the emulator after setup",
        type: "boolean",
        default: false,
      })
      .option("port", {
        describe: "Start the API server on this port after launch",
        type: "number",
      })
      .option("vnc-port", {
        describe: "VNC port for headless mode (default: 5900)",
        type: "number",
        default: 5900,
      })
      .option("force", {
        alias: "f",
        describe: "Force re-setup even if already configured",
        type: "boolean",
        default: false,
      }),
  handler: async (argv) => {
    const backendType = (argv.backend as "qemu" | "dosbox") ?? "qemu"
    const projectDir = argv.project
    const paths = resolvePaths(projectDir, backendType)
    const force = argv.force

    console.log("dosprobe bootstrap")
    console.log("==================")
    console.log(`  Project: ${projectDir}`)
    console.log(`  Backend: ${backendType}`)

    // ── Step 1: Init ──
    step(1, "Initializing project config")
    const configPath = join(projectDir, CONFIG_FILENAME)
    if (!existsSync(configPath) || force) {
      const config: ProjectConfig = { backend: backendType }
      writeProjectConfig(projectDir, config)
      console.log(`  Created ${CONFIG_FILENAME}`)
    } else {
      console.log(`  ${CONFIG_FILENAME} already exists, skipping`)
    }

    // ── Step 2: Setup ──
    step(2, `Setting up ${backendType} environment`)

    if (backendType === "qemu") {
      ensureDirs(paths)

      // Check dependencies
      const missing: string[] = []
      const qemu = which("qemu-system-i386")
      if (!qemu) missing.push("qemu-system-i386")
      if (!which("mdel") || !which("mcopy")) missing.push("mtools")
      const mkisofs = which("mkisofs") ?? which("genisoimage")
      if (!mkisofs) missing.push("mkisofs/genisoimage")

      if (missing.length > 0) {
        console.error(`  Missing dependencies: ${missing.join(", ")}`)
        console.error(`  Install with: sudo apt-get install qemu-system-x86 mtools genisoimage`)
        process.exitCode = 1
        return
      }
      console.log(`  Found QEMU: ${qemu}`)

      // Create shared directory structure
      mkdirSync(join(paths.sharedDir, "game"), { recursive: true })
      mkdirSync(join(paths.sharedDir, "tools"), { recursive: true })

      if (!existsSync(paths.diskImage) || force) {
        console.log("  Running dosprobe setup qemu...")
        try {
          execSync(
            `"${process.argv[0]}" "${process.argv[1]}" setup qemu ${force ? "--force" : ""} --project "${projectDir}"`,
            {
              stdio: "inherit",
              cwd: projectDir,
            },
          )
        } catch {
          console.error("  Setup failed")
          process.exitCode = 1
          return
        }
      } else {
        console.log("  Disk image already exists, skipping setup")
      }
    } else {
      console.error("  Bootstrap currently only supports QEMU backend")
      process.exitCode = 1
      return
    }

    // ── Step 3: Fetch game ──
    if (argv["game-url"]) {
      step(3, "Fetching game")
      const url = argv["game-url"]
      const outputDir = paths.isosDir
      mkdirSync(outputDir, { recursive: true })

      const urlFilename = basename(new URL(url).pathname)
      const ext = extname(urlFilename).toLowerCase()

      const tmpDir = join(tmpdir(), `dosprobe-bootstrap-${Date.now()}`)
      mkdirSync(tmpDir, { recursive: true })
      const downloadPath = join(tmpDir, urlFilename)

      try {
        console.log(`  Downloading ${url}...`)
        execSync(`curl -L -o "${downloadPath}" "${url}"`, {
          stdio: "inherit",
          timeout: 600_000,
        })

        if (!existsSync(downloadPath)) {
          console.error("  Download failed")
          process.exitCode = 1
          return
        }

        const fileSize = statSync(downloadPath).size
        console.log(`  Downloaded ${(fileSize / (1024 * 1024)).toFixed(1)} MB`)

        if (ext === ".zip") {
          const extractDir = join(tmpDir, "extracted")
          mkdirSync(extractDir, { recursive: true })
          console.log("  Extracting...")
          execSync(`unzip -o "${downloadPath}" -d "${extractDir}"`, { stdio: "inherit" })

          // Find ISOs
          const isoFiles = findFilesRecursive(extractDir, ".iso")
          if (isoFiles.length > 0) {
            for (const isoPath of isoFiles) {
              const name = basename(isoPath)
              const dest = join(outputDir, name)
              console.log(`  Extracted ISO: ${name}`)
              renameSync(isoPath, dest)
            }
          } else {
            console.log("  No ISO files found in archive, copying all files")
            execSync(`cp -r "${extractDir}/"* "${outputDir}/"`, { stdio: "inherit" })
          }
        } else if (ext === ".iso") {
          renameSync(downloadPath, join(outputDir, urlFilename))
        }

        // List resulting files
        const files = readdirSync(outputDir)
        console.log(`  Files in ${outputDir}:`)
        for (const f of files) {
          const size = statSync(join(outputDir, f)).size
          console.log(`    ${f} (${(size / (1024 * 1024)).toFixed(1)} MB)`)
        }
      } catch (err) {
        console.error("  Fetch failed:", err instanceof Error ? err.message : err)
        process.exitCode = 1
        return
      } finally {
        rmSync(tmpDir, { recursive: true, force: true })
      }

      // Update config with detected ISO
      const isoFiles = readdirSync(outputDir).filter((f) => f.toLowerCase().endsWith(".iso"))
      if (isoFiles.length === 1) {
        const config: ProjectConfig = {
          backend: backendType,
          game: { iso: join(outputDir, isoFiles[0]!) },
        }
        writeProjectConfig(projectDir, config)
        console.log(`  Updated ${CONFIG_FILENAME} with game.iso`)
      }
    } else {
      step(3, "No game URL provided, skipping download")
    }

    // ── Step 4: Launch ──
    if (argv.launch || argv.headless || argv.port) {
      step(4, "Launching QEMU")

      const launcher = new QemuLauncher()
      const headless = argv.headless ?? false
      const vncPort = argv["vnc-port"] ?? 5900

      // Detect game ISO
      let gameIso: string | undefined
      try {
        const isoFiles = readdirSync(paths.isosDir)
          .filter((f) => f.toLowerCase().endsWith(".iso"))
          .sort()
        if (isoFiles.length >= 1) {
          gameIso = join(paths.isosDir, isoFiles[0]!)
          console.log(`  Auto-mounting ISO: ${isoFiles[0]}`)
        }
      } catch {
        // ignore
      }

      await launcher.launch({
        type: "qemu",
        mode: headless ? "headless" : "interactive",
        diskImage: paths.diskImage,
        sharedIso: existsSync(paths.sharedIso) ? paths.sharedIso : undefined,
        gameIso,
        qmpSocketPath: paths.qmpSocketPath,
        vncPort: headless ? vncPort : undefined,
      })

      console.log(`  QEMU running (PID: ${launcher.getPid()})`)
      console.log(`  QMP socket: ${paths.qmpSocketPath}`)
      if (headless) {
        console.log(`  VNC: :${vncPort}`)
      }

      // ── Step 5: Start server ──
      if (argv.port) {
        step(5, `Starting API server on port ${argv.port}`)
        // Start serve in the same process by importing the handler
        const serveArgs = [
          process.argv[0]!,
          process.argv[1]!,
          "serve",
          "--port",
          `${argv.port}`,
          "--project",
          projectDir,
        ]
        console.log(`  Server starting on http://localhost:${argv.port}`)
        console.log(`  Press Ctrl+C to stop`)

        // Re-exec dosprobe serve as a child process
        const serveProc = spawn(
          process.argv[0]!,
          [process.argv[1]!, "serve", "--port", `${argv.port}`, "--project", projectDir],
          {
            stdio: "inherit",
            env: process.env,
          },
        )

        // Wait for either serve to exit or a signal
        await new Promise<void>((resolve) => {
          serveProc.on("exit", () => resolve())
          process.on("SIGINT", () => {
            serveProc.kill("SIGINT")
            launcher.kill()
            resolve()
          })
          process.on("SIGTERM", () => {
            serveProc.kill("SIGTERM")
            launcher.kill()
            resolve()
          })
        })
      } else {
        // Just wait for QEMU to exit
        const code = await launcher.waitForExit()
        console.log(`  QEMU exited (code: ${code})`)
      }
    } else {
      step(4, "Setup complete!")
      console.log("\nTo launch QEMU:")
      console.log(`  dosprobe launch headless --vnc-port 5900`)
      console.log("\nTo start the server:")
      console.log(`  dosprobe serve --port 3000`)
      console.log("\nOr both at once:")
      console.log(`  dosprobe bootstrap --headless --port 3000`)
    }
  },
})

function findFilesRecursive(dir: string, extension: string): string[] {
  const results: string[] = []
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        results.push(...findFilesRecursive(fullPath, extension))
      } else if (entry.name.toLowerCase().endsWith(extension)) {
        results.push(fullPath)
      }
    }
  } catch {
    // ignore
  }
  return results
}
