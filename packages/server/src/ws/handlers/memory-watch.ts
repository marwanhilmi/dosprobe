import type { WebSocket } from 'ws';
import { parseAddress } from '@dosprobe/core';
import type { Backend } from '@dosprobe/core';
import { sha256 } from '@dosprobe/shared';
import type { ChannelManager } from '../channels.ts';

interface Watch {
  id: string;
  address: string;
  size: number;
  intervalMs: number;
  timer: ReturnType<typeof setInterval>;
  lastHash: string | null;
  inFlight: boolean;
}

const watches: Map<string, Watch> = new Map();
const MIN_INTERVAL_MS = 200;
let watchesSuspended = false;

export function startMemoryWatch(
  backend: Backend,
  ws: WebSocket,
  id: string,
  address: string,
  size: number,
  intervalMs: number,
  _channels: ChannelManager,
): void {
  // Stop existing watch with same id
  stopMemoryWatch(id);
  const addr = parseAddress(address);
  const effectiveIntervalMs = Math.max(intervalMs, MIN_INTERVAL_MS);

  const timer = setInterval(async () => {
    const watch = watches.get(id);
    if (!watch || watch.inFlight || watchesSuspended) {
      return;
    }
    watch.inFlight = true;

    try {
      const data = await backend.readMemory(addr, size);
      const hash = sha256(data);
      if (watch && hash !== watch.lastHash) {
        watch.lastHash = hash;
        // Send metadata frame
        ws.send(JSON.stringify({
          type: 'memory:update',
          id,
          address,
          size: data.length,
          sha256: hash,
          timestamp: Date.now(),
        }));
        // Send binary frame
        ws.send(data);
      }
    } catch {
      // Silently skip on error
    } finally {
      const watchAfterPoll = watches.get(id);
      if (watchAfterPoll) {
        watchAfterPoll.inFlight = false;
      }
    }
  }, effectiveIntervalMs);

  watches.set(id, {
    id,
    address,
    size,
    intervalMs: effectiveIntervalMs,
    timer,
    lastHash: null,
    inFlight: false,
  });
}

export function stopMemoryWatch(id: string): void {
  const watch = watches.get(id);
  if (watch) {
    clearInterval(watch.timer);
    watches.delete(id);
  }
}

export function stopAllWatches(): void {
  for (const [id] of watches) {
    stopMemoryWatch(id);
  }
}

export function suspendAllWatches(): void {
  watchesSuspended = true;
}

export function resumeAllWatches(invalidateHashes = true): void {
  watchesSuspended = false;
  if (invalidateHashes) {
    invalidateAllWatches();
  }
}

export function invalidateAllWatches(): void {
  for (const watch of watches.values()) {
    watch.lastHash = null;
  }
}
