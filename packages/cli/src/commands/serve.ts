import http from "node:http"
import { existsSync, readdirSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { Readable } from "node:stream"
import { fileURLToPath } from "node:url"
import { createServer, type ViteDevServer } from "vite"
import { QemuBackend, DosboxBackend } from "@dosprobe/core"
import { createApp, attachWebSocket, createVncProxy, bridgeVnc } from "@dosprobe/server"
import type { BackendFactory, LaunchDefaults } from "@dosprobe/server"
import {
  resolveBackendType,
  resolvePaths,
  ensureDirs,
  getProjectConfig,
  defineCommand,
} from "../resolve-backend.ts"

type DosprobeApp = ReturnType<typeof createApp>["app"]

function isApiRequest(url: string | undefined): boolean {
  if (!url) return false
  return url === "/api" || url.startsWith("/api/") || url.startsWith("/api?")
}

function resolveUiPaths() {
  const commandsDir = dirname(fileURLToPath(import.meta.url))
  const uiRoot = join(commandsDir, "..", "..", "..", "ui")
  const uiDistAbsolute = join(uiRoot, "dist")

  return {
    uiRoot,
    uiDistAbsolute,
    uiDistRelative: relative(process.cwd(), uiDistAbsolute) || ".",
  }
}

async function forwardToApp(
  app: DosprobeApp,
  port: number,
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  try {
    const hasBody = req.method !== "GET" && req.method !== "HEAD"
    const init: RequestInit = {
      method: req.method,
      headers: req.headers as HeadersInit,
    }

    if (hasBody) {
      // Pipe the incoming body as a web ReadableStream.
      ;(init as Record<string, unknown>).body = Readable.toWeb(req)
      ;(init as Record<string, unknown>).duplex = "half"
    }

    const response = await app.fetch(new Request(`http://localhost:${port}${req.url ?? "/"}`, init))

    res.writeHead(response.status, Object.fromEntries(response.headers.entries()))

    if (response.body) {
      const reader = response.body.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        res.write(value)
      }
    }

    res.end()
  } catch (err) {
    console.error(err)

    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" })
    }
    if (!res.writableEnded) {
      res.end(err instanceof Error ? err.message : String(err))
    }
  }
}

async function forwardToVite(
  vite: ViteDevServer,
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  try {
    await new Promise<void>((resolve, reject) => {
      vite.middlewares(req, res, (err: unknown) => {
        if (err) {
          reject(err)
          return
        }

        if (!res.writableEnded) {
          if (!res.headersSent) {
            res.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
          }
          res.end("Not Found")
        }

        resolve()
      })
    })
  } catch (err) {
    if (err instanceof Error) {
      vite.ssrFixStacktrace(err)
    }
    console.error(err)

    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" })
    }
    if (!res.writableEnded) {
      res.end(err instanceof Error ? (err.stack ?? err.message) : String(err))
    }
  }
}

export const serveCommand = defineCommand({
  command: "serve",
  describe: "Start REST + WebSocket API server",
  builder: (yargs) =>
    yargs
      .option("port", {
        describe: "Port to listen on (default: 3000)",
        type: "number",
      })
      .option("dev", {
        describe: "Serve the UI via Vite middleware with HMR enabled",
        type: "boolean",
        default: false,
      }),
  handler: async (argv) => {
    const config = getProjectConfig(argv)
    const port = argv.port ?? config.server?.port ?? 3000
    const devMode = argv.dev ?? false
    const type = resolveBackendType(argv)
    const projectDir = argv.project
    const paths = resolvePaths(projectDir, type)
    const { uiRoot, uiDistAbsolute, uiDistRelative } = resolveUiPaths()
    ensureDirs(paths)

    if (!devMode && !existsSync(uiDistAbsolute)) {
      throw new Error(`Prebuilt UI not found at ${uiDistAbsolute}. Run "pnpm build:ui" first.`)
    }

    // Factory for creating backends on demand (used by /api/backend/select).
    // Creates a backend object in disconnected state — launch() starts the process.
    const backendFactory: BackendFactory = async (backendType) => {
      const typePaths = resolvePaths(projectDir, backendType)
      ensureDirs(typePaths)

      if (backendType === "qemu") {
        console.log("QEMU backend ready (disconnected — use Launch to start)")
        return new QemuBackend(typePaths.capturesDir)
      } else {
        console.log("DOSBox-X backend ready")
        return new DosboxBackend({
          capturesDir: typePaths.capturesDir,
          confDir: typePaths.confDir,
          driveCPath: typePaths.driveCPath,
          statesDir: typePaths.statesDir,
        })
      }
    }

    // Try to connect to an already-running backend at startup
    let initialBackend = null
    try {
      if (type === "qemu") {
        const qemu = new QemuBackend(paths.capturesDir)
        await qemu.connectToRunning(paths.qmpSocketPath)
        initialBackend = qemu
        console.log(`Connected to running QEMU (QMP: ${paths.qmpSocketPath})`)
      } else {
        initialBackend = await backendFactory(type)
      }
    } catch (err) {
      console.warn(`Backend not connected: ${err instanceof Error ? err.message : err}`)
      console.warn("Server will start without a backend. Select one in the UI.")
    }

    // Compute launch defaults from resolved project paths
    const qemuPaths = resolvePaths(projectDir, "qemu")
    const dosboxPaths = resolvePaths(projectDir, "dosbox")
    const autoDetectedGameIso = (() => {
      if (config.game?.iso) {
        return config.game.iso
      }
      try {
        const isoFiles = readdirSync(qemuPaths.isosDir)
          .filter((f) => f.toLowerCase().endsWith(".iso"))
          .sort()
        if (isoFiles.length === 1) {
          return join(qemuPaths.isosDir, isoFiles[0]!)
        }
      } catch {
        // ignore if isos dir does not exist yet
      }
      return undefined
    })()
    const launchDefaults: LaunchDefaults = {
      qemu: {
        diskImage: qemuPaths.diskImage,
        sharedIso: qemuPaths.sharedIso,
        gameIso: autoDetectedGameIso,
        qmpSocketPath: qemuPaths.qmpSocketPath,
        capturesDir: qemuPaths.capturesDir,
        ram: config.qemu?.ram,
        display: config.qemu?.display,
        audio: config.qemu?.audio,
        gdbPort: config.qemu?.gdbPort,
        accel: config.qemu?.accel,
        cpu: config.qemu?.cpu,
        smp: config.qemu?.smp,
      },
      dosbox: {
        driveCPath: dosboxPaths.driveCPath,
        confDir: dosboxPaths.confDir,
        capturesDir: dosboxPaths.capturesDir,
        gameExe: config.game?.exe,
        gameIso: config.game?.iso,
        dosboxBin: config.dosbox?.binary,
        output: config.dosbox?.renderer,
      },
    }

    const { app, holder } = createApp(
      initialBackend,
      {
        capturesDir: paths.capturesDir,
        goldenDir: paths.goldenDir,
      },
      backendFactory,
      launchDefaults,
      devMode ? undefined : uiDistRelative,
    )

    let vite: ViteDevServer | null = null
    const server = http.createServer((req, res) => {
      if (devMode && vite && !isApiRequest(req.url)) {
        void forwardToVite(vite, req, res)
        return
      }

      void forwardToApp(app, port, req, res)
    })

    if (devMode) {
      vite = await createServer({
        root: uiRoot,
        appType: "spa",
        server: {
          middlewareMode: true,
          hmr: { server },
        },
      })

      server.on("close", () => {
        void vite?.close()
      })
    }

    const wss = attachWebSocket(() => holder.backend, holder)
    const vncWss = createVncProxy()

    server.on("upgrade", (req, socket, head) => {
      const pathname = req.url ?? ""

      if (pathname === "/ws" || pathname.startsWith("/ws?")) {
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit("connection", ws, req)
        })
      } else if (pathname === "/vnc") {
        const backend = holder.backend
        if (!backend || !backend.status().vncPort) {
          socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n")
          socket.destroy()
          return
        }
        vncWss.handleUpgrade(req, socket, head, (ws) => {
          bridgeVnc(ws, backend)
        })
      } else {
        if (!devMode) {
          socket.destroy()
        }
      }
    })

    server.listen(port, () => {
      console.log(`dosprobe server running on http://localhost:${port}`)
      if (devMode) {
        console.log(`UI served via Vite middleware from ${uiRoot}`)
      } else {
        console.log(`Serving prebuilt UI from ${uiDistAbsolute}`)
      }
      console.log(`WebSocket available at ws://localhost:${port}/ws`)
      console.log(`VNC proxy available at ws://localhost:${port}/vnc`)
    })
  },
})
