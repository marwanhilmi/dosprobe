import { useCallback, useEffect, useState } from 'react';
import type { Breakpoint, BreakpointType } from '../types/api';
import { getBreakpoints, addBreakpoint, removeBreakpoint } from '../lib/api';
import { useWebSocket } from '../contexts/WebSocketContext';

interface UseBreakpointsResult {
  breakpoints: Breakpoint[];
  activeBreakpointId: string | null;
  loading: boolean;
  add: (type: BreakpointType, address?: string, interrupt?: number, ah?: number) => Promise<Breakpoint | null>;
  remove: (id: string) => Promise<void>;
  refresh: () => void;
}

export function useBreakpoints(): UseBreakpointsResult {
  const [breakpoints, setBreakpoints] = useState<Breakpoint[]>([]);
  const [activeBreakpointId, setActiveBreakpointId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { onMessage, connected } = useWebSocket();

  const refresh = useCallback(() => {
    setLoading(true);
    getBreakpoints()
      .then((res) => setBreakpoints(res.breakpoints))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const add = useCallback(async (type: BreakpointType, address?: string, interrupt?: number, ah?: number) => {
    try {
      const bp = await addBreakpoint({ type, address, interrupt, ah });
      setBreakpoints((prev) => [...prev, bp]);
      return bp;
    } catch {
      return null;
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    try {
      await removeBreakpoint(id);
      setBreakpoints((prev) => prev.filter((bp) => bp.id !== id));
      if (activeBreakpointId === id) setActiveBreakpointId(null);
    } catch {
      // ignore
    }
  }, [activeBreakpointId]);

  // Highlight active breakpoint from WS
  useEffect(() => {
    if (!connected) return;
    const unsub = onMessage((msg) => {
      if (msg.type === 'debug:breakpoint-hit') {
        setActiveBreakpointId(msg.breakpointId);
      } else if (msg.type === 'debug:step-complete') {
        setActiveBreakpointId(null);
      }
    });
    return unsub;
  }, [connected, onMessage]);

  return { breakpoints, activeBreakpointId, loading, add, remove, refresh };
}
