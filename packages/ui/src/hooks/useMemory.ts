import { useCallback, useEffect, useRef, useState } from 'react';
import { readMemoryRaw } from '../lib/api';
import { useWebSocket } from '../contexts/WebSocketContext';

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

  const watch = useCallback((address: string, size: number, intervalMs = 500) => {
    if (watchIdRef.current) {
      send({ type: 'memory:unwatch', id: watchIdRef.current });
    }
    const id = `watch-${Date.now()}`;
    watchIdRef.current = id;
    setWatching(true);
    send({ type: 'memory:watch', address, size, intervalMs, id });
  }, [send]);

  const unwatch = useCallback(() => {
    if (watchIdRef.current) {
      send({ type: 'memory:unwatch', id: watchIdRef.current });
      watchIdRef.current = null;
    }
    setWatching(false);
  }, [send]);

  // Handle WS memory updates with binary data
  useEffect(() => {
    if (!connected) return;
    send({ type: 'subscribe', channel: 'memory' });

    const unsub = onMessage((msg, binary) => {
      if (msg.type === 'memory:update' && msg.id === watchIdRef.current && binary) {
        setData((prev) => {
          setPrevData(prev);
          return binary;
        });
      }
    });

    return () => {
      send({ type: 'unsubscribe', channel: 'memory' });
      unsub();
    };
  }, [connected, send, onMessage]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current) {
        send({ type: 'memory:unwatch', id: watchIdRef.current });
      }
    };
  }, [send]);

  return { data, prevData, loading, error, read, watch, unwatch, watching };
}
