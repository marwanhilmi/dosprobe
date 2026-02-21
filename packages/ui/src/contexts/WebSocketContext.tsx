import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { WsManager } from '../lib/ws';
import type { ClientMessage, ServerMessage } from '../types/ws';

interface WebSocketContextValue {
  send: (msg: ClientMessage) => void;
  connected: boolean;
  onMessage: (handler: (msg: ServerMessage, binary?: Uint8Array) => void) => () => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const managerRef = useRef<WsManager | null>(null);

  if (!managerRef.current) {
    managerRef.current = new WsManager();
  }

  const manager = managerRef.current;

  useEffect(() => {
    manager.connect();
    return () => { manager.disconnect(); };
  }, [manager]);

  const connected = useSyncExternalStore(
    (cb) => manager.onConnection(cb),
    () => manager.state === 'connected',
  );

  const value = useMemo<WebSocketContextValue>(() => ({
    send: (msg) => manager.send(msg),
    connected,
    onMessage: (handler) => manager.onMessage(handler),
  }), [manager, connected]);

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket(): WebSocketContextValue {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error('useWebSocket must be used within WebSocketProvider');
  return ctx;
}
