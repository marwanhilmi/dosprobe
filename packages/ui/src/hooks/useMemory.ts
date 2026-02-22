import { useCallback, useEffect, useRef, useState } from 'react';
import { readMemoryRaw } from '../lib/api';
import { useWebSocket } from '../contexts/WebSocketContext';

interface WatchConfig {
  address: string;
  size: number;
  intervalMs: number;
}

interface UseMemoryResult {
  data: Uint8Array | null;
  prevData: Uint8Array | null;
  loading: boolean;
  error: string | null;
  read: (address: string, size: number) => void;
  watch: (address: string, size: number, intervalMs?: number) => void;
  unwatch: () => void;
  watching: boolean;
}

export function useMemory(): UseMemoryResult {
  const [data, setData] = useState<Uint8Array | null>(null);
  const [prevData, setPrevData] = useState<Uint8Array | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const watchIdRef = useRef<string | null>(null);
  const watchConfigRef = useRef<WatchConfig | null>(null);
  const { send, onMessage, connected } = useWebSocket();

  const read = useCallback((address: string, size: number) => {
    setLoading(true);
    readMemoryRaw(address, size)
      .then((buf) => {
        const arr = new Uint8Array(buf);
        setData((prev) => {
          setPrevData(prev);
          return arr;
        });
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const stopActiveWatch = useCallback(() => {
    if (!watchIdRef.current) {
      return;
    }
    send({ type: 'memory:unwatch', id: watchIdRef.current });
    watchIdRef.current = null;
  }, [send]);

  const startWatch = useCallback((config: WatchConfig) => {
    if (!connected) {
      return;
    }
    stopActiveWatch();
    const id = `watch-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    watchIdRef.current = id;
    send({
      type: 'memory:watch',
      address: config.address,
      size: config.size,
      intervalMs: config.intervalMs,
      id,
    });
  }, [connected, send, stopActiveWatch]);

  const watch = useCallback((address: string, size: number, intervalMs = 500) => {
    const config = { address, size, intervalMs };
    watchConfigRef.current = config;
    setWatching(true);
    startWatch(config);
  }, [startWatch]);

  const unwatch = useCallback(() => {
    watchConfigRef.current = null;
    stopActiveWatch();
    setWatching(false);
  }, [stopActiveWatch]);

  // Handle WS memory updates with binary data
  useEffect(() => {
    if (!connected) return;
    const unsub = onMessage((msg, binary) => {
      if (msg.type === 'memory:update' && msg.id === watchIdRef.current && binary) {
        setData((prev) => {
          setPrevData(prev);
          return binary;
        });
      }
    });
    send({ type: 'subscribe', channel: 'memory' });

    if (watchConfigRef.current) {
      startWatch(watchConfigRef.current);
    }

    return () => {
      stopActiveWatch();
      send({ type: 'unsubscribe', channel: 'memory' });
      unsub();
    };
  }, [connected, send, onMessage, startWatch, stopActiveWatch]);

  return { data, prevData, loading, error, read, watch, unwatch, watching };
}
