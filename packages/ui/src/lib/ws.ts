import type { ClientMessage, ServerMessage } from '../types/ws';

type MessageHandler = (msg: ServerMessage, binaryData?: Uint8Array) => void;

type ConnectionState = 'disconnected' | 'connecting' | 'connected';

type ConnectionHandler = (state: ConnectionState) => void;

/**
 * Binary frame pairing state machine.
 * Server sends a JSON metadata frame, then (for some message types) a binary data frame.
 */
type FrameState =
  | { phase: 'IDLE' }
  | { phase: 'AWAITING_BINARY'; metadata: ServerMessage };

const MESSAGES_WITH_BINARY = new Set([
  'memory:update',
  'memory:data',
  'screenshot:data',
]);

export class WsManager {
  private ws: WebSocket | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private connectionHandlers: Set<ConnectionHandler> = new Set();
  private frameState: FrameState = { phase: 'IDLE' };
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private _state: ConnectionState = 'disconnected';
  private disposed = false;

  get state(): ConnectionState {
    return this._state;
  }

  connect(): void {
    if (this.ws) return;
    this.disposed = false;

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}/ws`;

    this._setState('connecting');
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      this.reconnectDelay = 1000;
      this._setState('connected');
    };

    ws.onmessage = (ev: MessageEvent) => {
      if (ev.data instanceof ArrayBuffer) {
        this.handleBinaryFrame(new Uint8Array(ev.data));
      } else {
        this.handleJsonFrame(ev.data as string);
      }
    };

    ws.onclose = () => {
      this.ws = null;
      this.frameState = { phase: 'IDLE' };
      this._setState('disconnected');
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will fire after onerror
    };

    this.ws = ws;
  }

  disconnect(): void {
    this.disposed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._setState('disconnected');
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => { this.handlers.delete(handler); };
  }

  onConnection(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler);
    return () => { this.connectionHandlers.delete(handler); };
  }

  private _setState(state: ConnectionState): void {
    this._state = state;
    for (const h of this.connectionHandlers) {
      h(state);
    }
  }

  private handleJsonFrame(raw: string): void {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(raw) as ServerMessage;
    } catch {
      return;
    }

    if (MESSAGES_WITH_BINARY.has(msg.type) && 'size' in msg) {
      this.frameState = { phase: 'AWAITING_BINARY', metadata: msg };
      return;
    }

    this.dispatch(msg);
  }

  private handleBinaryFrame(data: Uint8Array): void {
    if (this.frameState.phase === 'AWAITING_BINARY') {
      const metadata = this.frameState.metadata;
      this.frameState = { phase: 'IDLE' };
      this.dispatch(metadata, data);
    }
    // Unexpected binary frame — ignore
  }

  private dispatch(msg: ServerMessage, binary?: Uint8Array): void {
    for (const h of this.handlers) {
      h(msg, binary);
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }
}
