import http from 'node:http';
import { Readable } from 'node:stream';
import type { CommandModule } from 'yargs';
import { QemuBackend, DosboxBackend } from '@dosprobe/core';
import { createApp, attachWebSocket } from '@dosprobe/server';
import type { BackendFactory, LaunchDefaults } from '@dosprobe/server';
import { resolveBackendType, resolvePaths, ensureDirs, getProjectConfig } from '../resolve-backend.ts';

export const serveCommand: CommandModule = {
  command: 'serve',
  describe: 'Start REST + WebSocket API server',
  builder: (yargs) =>
    yargs.option('port', {
      describe: 'Port to listen on (default: 3000)',
      type: 'number',
    }),
  handler: async (argv) => {
    const config = getProjectConfig(argv as Record<string, unknown>);
    const port = (argv['port'] as number | undefined) ?? config.server?.port ?? 3000;
    const type = resolveBackendType(argv as { backend?: string; project?: string });
    const projectDir = (argv['project'] as string | undefined) ?? process.cwd();
    const paths = resolvePaths(projectDir, type);
    ensureDirs(paths);

    // Factory for creating backends on demand (used by /api/backend/select).
    // Creates a backend object in disconnected state — launch() starts the process.
    const backendFactory: BackendFactory = async (backendType) => {
      const typePaths = resolvePaths(projectDir, backendType);
      ensureDirs(typePaths);

      if (backendType === 'qemu') {
        console.log('QEMU backend ready (disconnected — use Launch to start)');
        return new QemuBackend(typePaths.capturesDir);
      } else {
        console.log('DOSBox-X backend ready');
        return new DosboxBackend({
          capturesDir: typePaths.capturesDir,
          confDir: typePaths.confDir,
          driveCPath: typePaths.driveCPath,
          statesDir: typePaths.statesDir,
        });
      }
    };

    // Try to connect to an already-running backend at startup
    let initialBackend = null;
    try {
      if (type === 'qemu') {
        const qemu = new QemuBackend(paths.capturesDir);
        await qemu.connectToRunning(paths.qmpSocketPath);
        initialBackend = qemu;
        console.log(`Connected to running QEMU (QMP: ${paths.qmpSocketPath})`);
      } else {
        initialBackend = await backendFactory(type);
      }
    } catch (err) {
      console.warn(`Backend not connected: ${err instanceof Error ? err.message : err}`);
      console.warn('Server will start without a backend. Select one in the UI.');
    }

    // Compute launch defaults from resolved project paths
    const qemuPaths = resolvePaths(projectDir, 'qemu');
    const dosboxPaths = resolvePaths(projectDir, 'dosbox');
    const launchDefaults: LaunchDefaults = {
      qemu: {
        diskImage: qemuPaths.diskImage,
        sharedIso: qemuPaths.sharedIso,
        qmpSocketPath: qemuPaths.qmpSocketPath,
        capturesDir: qemuPaths.capturesDir,
      },
      dosbox: {
        driveCPath: dosboxPaths.driveCPath,
        confDir: dosboxPaths.confDir,
        capturesDir: dosboxPaths.capturesDir,
      },
    };

    const { app, holder } = createApp(initialBackend, {
      capturesDir: paths.capturesDir,
      goldenDir: paths.goldenDir,
    }, backendFactory, launchDefaults);

    const server = http.createServer(async (req, res) => {
      const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
      const init: RequestInit = {
        method: req.method,
        headers: req.headers as HeadersInit,
      };
      if (hasBody) {
        // Pipe the incoming body as a web ReadableStream
        (init as Record<string, unknown>).body = Readable.toWeb(req);
        (init as Record<string, unknown>).duplex = 'half';
      }
      const response = await app.fetch(
        new Request(`http://localhost:${port}${req.url}`, init),
      );
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      if (response.body) {
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      }
      res.end();
    });

    attachWebSocket(server, () => holder.backend);

    server.listen(port, () => {
      console.log(`dosprobe server running on http://localhost:${port}`);
      console.log(`WebSocket available at ws://localhost:${port}/ws`);
    });
  },
};
