// Client -> Server messages
export type ClientMessage =
  | { type: 'subscribe'; channel: string }
  | { type: 'unsubscribe'; channel: string }
  | { type: 'exec:pause' }
  | { type: 'exec:resume' }
  | { type: 'exec:step'; count?: number }
  | { type: 'keys:send'; keys: string[] }
  | { type: 'keys:hold'; key: string; duration: number }
  | { type: 'memory:watch'; address: string; size: number; intervalMs: number; id: string }
  | { type: 'memory:unwatch'; id: string }
  | { type: 'memory:read'; address: string; size: number; requestId: string }
  | { type: 'registers:read'; requestId: string }
  | { type: 'screenshot:take'; requestId: string };

// Server -> Client messages
export type ServerMessage =
  | { type: 'status:changed'; status: string; timestamp: number }
  | { type: 'debug:breakpoint-hit'; breakpointId: string; address: string; registers: Record<string, number>; timestamp: number }
  | { type: 'debug:step-complete'; registers: Record<string, number>; timestamp: number }
  | { type: 'memory:update'; id: string; address: string; size: number; sha256: string; timestamp: number }
  | { type: 'memory:data'; requestId: string; address: string; size: number; timestamp: number }
  | { type: 'registers:data'; requestId: string; registers: Record<string, number>; timestamp: number }
  | { type: 'screenshot:data'; requestId: string; format: string; size: number; timestamp: number }
  | { type: 'capture:progress'; captureId: string; stage: string; detail?: string; timestamp: number }
  | { type: 'capture:complete'; captureId: string; timestamp: number }
  | { type: 'error'; message: string; code?: string; requestId?: string };

export const CHANNELS = ['status', 'debug', 'memory', 'capture'] as const;
export type Channel = (typeof CHANNELS)[number];
