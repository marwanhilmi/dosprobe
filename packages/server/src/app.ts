import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { backendRoutes } from './routes/backend.ts';
import { launchRoutes } from './routes/launch.ts';
import { memoryRoutes } from './routes/memory.ts';
import { registersRoutes } from './routes/registers.ts';
import { screenshotRoutes } from './routes/screenshot.ts';
import { keysRoutes } from './routes/keys.ts';
import { breakpointsRoutes } from './routes/breakpoints.ts';
import { executionRoutes } from './routes/execution.ts';
import { snapshotRoutes } from './routes/snapshot.ts';
import { captureRoutes } from './routes/capture.ts';
import { goldenRoutes } from './routes/golden.ts';
import { stateRoutes } from './routes/state.ts';
import type { Backend } from '@dosprobe/core';

export interface ServerPaths {
  capturesDir: string;
  goldenDir: string;
}

/** Resolved project paths per backend type, used for launch defaults. */
export interface LaunchDefaults {
  qemu: {
    diskImage: string;
    sharedIso: string;
    qmpSocketPath: string;
    capturesDir: string;
  };
  dosbox: {
    driveCPath: string;
    confDir: string;
    capturesDir: string;
  };
}

export type BackendFactory = (type: 'qemu' | 'dosbox') => Promise<Backend>;

/**
 * Mutable holder for the active backend. Shared between the Hono app
 * (via context middleware) and the serve command (WebSocket getter).
 */
export interface BackendHolder {
  backend: Backend | null;
  setBackend(b: Backend | null): void;
}

export type AppContext = {
  Variables: {
    backend: Backend | null;
    paths: ServerPaths;
    backendHolder: BackendHolder;
    backendFactory: BackendFactory | null;
    launchDefaults: LaunchDefaults | null;
  };
};

export function createApp(
  initialBackend?: Backend | null,
  paths?: ServerPaths,
  backendFactory?: BackendFactory,
  launchDefaults?: LaunchDefaults,
) {
  const app = new Hono<AppContext>();

  app.use('*', cors());

  const resolvedPaths: ServerPaths = paths ?? { capturesDir: './captures', goldenDir: './golden' };

  const holder: BackendHolder = {
    backend: initialBackend ?? null,
    setBackend(b) { this.backend = b; },
  };

  // Inject backend and paths into context
  app.use('/api/*', async (c, next) => {
    c.set('backend', holder.backend);
    c.set('paths', resolvedPaths);
    c.set('backendHolder', holder);
    c.set('backendFactory', backendFactory ?? null);
    c.set('launchDefaults', launchDefaults ?? null);
    await next();
  });

  // Global error handler
  app.onError((err, c) => {
    if (err instanceof SyntaxError) {
      return c.json({ error: 'Invalid JSON' }, 400);
    }
    console.error(err);
    return c.json({ error: err.message ?? 'Internal server error' }, 500);
  });

  // Mount route groups
  app.route('/api', backendRoutes);
  app.route('/api', launchRoutes);
  app.route('/api', memoryRoutes);
  app.route('/api', registersRoutes);
  app.route('/api', screenshotRoutes);
  app.route('/api', keysRoutes);
  app.route('/api', breakpointsRoutes);
  app.route('/api', executionRoutes);
  app.route('/api', snapshotRoutes);
  app.route('/api', captureRoutes);
  app.route('/api', goldenRoutes);
  app.route('/api', stateRoutes);

  return { app, holder };
}
