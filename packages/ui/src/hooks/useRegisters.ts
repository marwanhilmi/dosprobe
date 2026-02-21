import { useCallback, useEffect, useRef, useState } from 'react';
import type { Registers } from '../types/api';
import { getRegisters } from '../lib/api';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useBackend } from '../contexts/BackendContext';

interface UseRegistersResult {
  registers: Registers | null;
  prevRegisters: Registers | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useRegisters(): UseRegistersResult {
  const [registers, setRegisters] = useState<Registers | null>(null);
  const [prevRegisters, setPrevRegisters] = useState<Registers | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { onMessage, send, connected } = useWebSocket();
  const { isPaused } = useBackend();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refresh = useCallback(() => {
    setLoading(true);
    getRegisters()
      .then((regs) => {
        if (!mountedRef.current) return;
        setRegisters((prev) => {
          setPrevRegisters(prev);
          return regs;
        });
        setError(null);
      })
      .catch((e: Error) => {
        if (!mountedRef.current) return;
        setError(e.message);
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
  }, []);

  // Fetch when paused
  useEffect(() => {
    if (isPaused) refresh();
  }, [isPaused, refresh]);

  // Subscribe to debug channel for auto-refresh on step/breakpoint
  useEffect(() => {
    if (!connected) return;
    send({ type: 'subscribe', channel: 'debug' });

    const unsub = onMessage((msg) => {
      if (msg.type === 'debug:step-complete' || msg.type === 'debug:breakpoint-hit') {
        const regs = msg.registers as unknown as Registers;
        setRegisters((prev) => {
          setPrevRegisters(prev);
          return regs;
        });
      }
    });

    return () => {
      send({ type: 'unsubscribe', channel: 'debug' });
      unsub();
    };
  }, [connected, send, onMessage]);

  return { registers, prevRegisters, loading, error, refresh };
}
