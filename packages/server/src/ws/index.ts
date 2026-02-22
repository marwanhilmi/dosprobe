import { WebSocketServer, type WebSocket } from 'ws';
import type { Backend } from '@dosprobe/core';
import { parseAddress } from '@dosprobe/core';
import { ChannelManager } from './channels.ts';
import type { ClientMessage, Channel, ServerMessage } from './protocol.ts';
import { CHANNELS } from './protocol.ts';
import { handleExecPause, handleExecResume, handleExecStep } from './handlers/debug.ts';
import {
  startMemoryWatch,
  stopMemoryWatch,
  stopAllWatches,
  stopWatchesForClient,
  suspendAllWatches,
  resumeAllWatches,
} from './handlers/memory-watch.ts';
import type { BackendHolder } from '../app.ts';

type StatusChangedMessage = Extract<ServerMessage, { type: 'status:changed' }>;

function createStatusChangedMessage(backend: Backend | null): StatusChangedMessage {
  const backendInfo = backend ? backend.status() : null;
  return {
    type: 'status:changed',
    status: backendInfo?.status ?? 'disconnected',
    backend: backendInfo,
    timestamp: Date.now(),
  };
}

export function attachWebSocket(
  getBackend: () => Backend | null,
  backendHolder?: BackendHolder,
): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });
  const channels = new ChannelManager();
  let watchedBackend: Backend | null = null;
  let onStatusChanged: (() => void) | null = null;
  let onSnapshotLoading: (() => void) | null = null;
  let onSnapshotLoaded: (() => void) | null = null;
  let onSnapshotLoadFailed: (() => void) | null = null;

  const detachBackendHooks = (): void => {
    if (!watchedBackend) {
      return;
    }
    if (onStatusChanged) {
      watchedBackend.off('status', onStatusChanged);
    }
    if (onSnapshotLoading) {
      watchedBackend.off('snapshot:loading', onSnapshotLoading);
    }
    if (onSnapshotLoaded) {
      watchedBackend.off('snapshot:loaded', onSnapshotLoaded);
    }
    if (onSnapshotLoadFailed) {
      watchedBackend.off('snapshot:load-failed', onSnapshotLoadFailed);
    }
  };

  const ensureBackendHooks = (): void => {
    const backend = getBackend();
    if (backend === watchedBackend) {
      return;
    }

    detachBackendHooks();

    watchedBackend = backend;
    onStatusChanged = null;
    onSnapshotLoading = null;
    onSnapshotLoaded = null;
    onSnapshotLoadFailed = null;

    channels.broadcast('status', createStatusChangedMessage(watchedBackend));

    if (!watchedBackend) {
      return;
    }

    const statusBackend = watchedBackend;
    onStatusChanged = () => {
      channels.broadcast('status', createStatusChangedMessage(statusBackend));
    };
    onSnapshotLoading = () => {
      suspendAllWatches();
    };
    onSnapshotLoaded = () => {
      resumeAllWatches(true);
    };
    onSnapshotLoadFailed = () => {
      resumeAllWatches(true);
    };

    watchedBackend.on('status', onStatusChanged);
    watchedBackend.on('snapshot:loading', onSnapshotLoading);
    watchedBackend.on('snapshot:loaded', onSnapshotLoaded);
    watchedBackend.on('snapshot:load-failed', onSnapshotLoadFailed);
  };

  ensureBackendHooks();

  const handleBackendChange = () => {
    stopAllWatches();
    ensureBackendHooks();
  };

  if (backendHolder) {
    backendHolder.on('backendChange', handleBackendChange);
  }

  wss.on('connection', (ws: WebSocket) => {
    ensureBackendHooks();
    ws.send(JSON.stringify(createStatusChangedMessage(getBackend())));

    ws.on('message', async (raw) => {
      ensureBackendHooks();
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
              const channel = msg.channel as Channel;
              channels.subscribe(ws, channel);
              if (channel === 'status') {
                ws.send(JSON.stringify(createStatusChangedMessage(getBackend())));
              }
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
      stopWatchesForClient(ws);
      channels.removeClient(ws);
    });
  });

  // Clean up on server close
  wss.on('close', () => {
    if (backendHolder) {
      backendHolder.off('backendChange', handleBackendChange);
    }
    detachBackendHooks();
    stopAllWatches();
  });

  return wss;
}
