import { WebSocketServer, type WebSocket } from 'ws';
import type { Server } from 'node:http';
import type { Backend } from '@dosprobe/core';
import { parseAddress } from '@dosprobe/core';
import { ChannelManager } from './channels.ts';
import type { ClientMessage, Channel } from './protocol.ts';
import { CHANNELS } from './protocol.ts';
import { handleExecPause, handleExecResume, handleExecStep } from './handlers/debug.ts';
import {
  startMemoryWatch,
  stopMemoryWatch,
  stopAllWatches,
  suspendAllWatches,
  resumeAllWatches,
} from './handlers/memory-watch.ts';

export function attachWebSocket(
  server: Server,
  getBackend: () => Backend | null,
): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const channels = new ChannelManager();
  let watchedBackend: Backend | null = null;
  let onSnapshotLoading: (() => void) | null = null;
  let onSnapshotLoaded: (() => void) | null = null;
  let onSnapshotLoadFailed: (() => void) | null = null;

  const ensureSnapshotHooks = (): void => {
    const backend = getBackend();
    if (backend === watchedBackend) {
      return;
    }

    if (watchedBackend) {
      if (onSnapshotLoading) {
        watchedBackend.off('snapshot:loading', onSnapshotLoading);
      }
      if (onSnapshotLoaded) {
        watchedBackend.off('snapshot:loaded', onSnapshotLoaded);
      }
      if (onSnapshotLoadFailed) {
        watchedBackend.off('snapshot:load-failed', onSnapshotLoadFailed);
      }
    }

    watchedBackend = backend;
    onSnapshotLoading = null;
    onSnapshotLoaded = null;
    onSnapshotLoadFailed = null;

    if (!watchedBackend) {
      return;
    }

    onSnapshotLoading = () => {
      suspendAllWatches();
    };
    onSnapshotLoaded = () => {
      resumeAllWatches(true);
    };
    onSnapshotLoadFailed = () => {
      resumeAllWatches(true);
    };

    watchedBackend.on('snapshot:loading', onSnapshotLoading);
    watchedBackend.on('snapshot:loaded', onSnapshotLoaded);
    watchedBackend.on('snapshot:load-failed', onSnapshotLoadFailed);
  };

  ensureSnapshotHooks();

  wss.on('connection', (ws: WebSocket) => {
    ws.on('message', async (raw) => {
      ensureSnapshotHooks();
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
        return;
      }

      const backend = getBackend();

      try {
        switch (msg.type) {
          case 'subscribe':
            if (CHANNELS.includes(msg.channel as Channel)) {
              channels.subscribe(ws, msg.channel as Channel);
            }
            break;

          case 'unsubscribe':
            channels.unsubscribe(ws, msg.channel as Channel);
            break;

          case 'exec:pause':
            if (backend) await handleExecPause(backend, ws);
            break;

          case 'exec:resume':
            if (backend) await handleExecResume(backend);
            break;

          case 'exec:step':
            if (backend) await handleExecStep(backend, ws, channels);
            break;

          case 'keys:send':
            if (backend) await backend.sendKeys(msg.keys);
            break;

          case 'memory:watch':
            if (backend) {
              startMemoryWatch(
                backend, ws, msg.id, msg.address, msg.size, msg.intervalMs, channels,
              );
            }
            break;

          case 'memory:unwatch':
            stopMemoryWatch(msg.id);
            break;

          case 'memory:read': {
            if (!backend) break;
            const addr = parseAddress(msg.address);
            const data = await backend.readMemory(addr, msg.size);
            ws.send(JSON.stringify({
              type: 'memory:data',
              requestId: msg.requestId,
              address: msg.address,
              size: data.length,
              timestamp: Date.now(),
            }));
            ws.send(data);
            break;
          }

          case 'registers:read': {
            if (!backend) break;
            const regs = await backend.readRegisters();
            ws.send(JSON.stringify({
              type: 'registers:data',
              requestId: msg.requestId,
              registers: regs,
              timestamp: Date.now(),
            }));
            break;
          }

          case 'screenshot:take': {
            if (!backend) break;
            const ss = await backend.screenshot();
            ws.send(JSON.stringify({
              type: 'screenshot:data',
              requestId: msg.requestId,
              format: ss.format,
              size: ss.data.length,
              timestamp: Date.now(),
            }));
            ws.send(ss.data);
            break;
          }
        }
      } catch (err) {
        const requestId = 'requestId' in msg ? (msg as { requestId: string }).requestId : undefined;
        ws.send(JSON.stringify({
          type: 'error',
          message: err instanceof Error ? err.message : 'Unknown error',
          requestId,
        }));
      }
    });

    ws.on('close', () => {
      channels.removeClient(ws);
    });
  });

  // Clean up on server close
  wss.on('close', () => {
    if (watchedBackend) {
      if (onSnapshotLoading) {
        watchedBackend.off('snapshot:loading', onSnapshotLoading);
      }
      if (onSnapshotLoaded) {
        watchedBackend.off('snapshot:loaded', onSnapshotLoaded);
      }
      if (onSnapshotLoadFailed) {
        watchedBackend.off('snapshot:load-failed', onSnapshotLoadFailed);
      }
    }
    stopAllWatches();
  });

  return wss;
}
