import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { BackendInfo, BackendStatus } from '../types/api';
import { getBackend } from '../lib/api';
import { useWebSocket } from './WebSocketContext';

interface BackendContextValue {
  backend: BackendInfo | null;
  isRunning: boolean;
  isPaused: boolean;
  refresh: () => void;
}

const BackendContext = createContext<BackendContextValue | null>(null);

const POLL_INTERVAL = 5000;

export function BackendProvider({ children }: { children: ReactNode }) {
  const [backend, setBackend] = useState<BackendInfo | null>(null);
  const { onMessage, send, connected } = useWebSocket();

  const refresh = useCallback(() => {
    getBackend().then(setBackend).catch(() => {
      setBackend(null);
    });
  }, []);

  // Initial fetch + polling
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [refresh]);

  // Subscribe to WS status channel
  useEffect(() => {
    if (!connected) return;
    send({ type: 'subscribe', channel: 'status' });

    const unsub = onMessage((msg) => {
      if (msg.type === 'status:changed') {
        setBackend((prev) =>
          prev ? { ...prev, status: msg.status as BackendStatus } : prev,
        );
      }
    });

    return () => {
      send({ type: 'unsubscribe', channel: 'status' });
      unsub();
    };
  }, [connected, send, onMessage]);

  const isRunning = backend?.status === 'running';
  const isPaused = backend?.status === 'paused';

  return (
    <BackendContext.Provider value={{ backend, isRunning, isPaused, refresh }}>
      {children}
    </BackendContext.Provider>
  );
}

export function useBackend(): BackendContextValue {
  const ctx = useContext(BackendContext);
  if (!ctx) throw new Error('useBackend must be used within BackendProvider');
  return ctx;
}
