import type { WebSocket } from 'ws';
import type { Channel, ServerMessage } from './protocol.ts';

export class ChannelManager {
  private subscriptions: Map<Channel, Set<WebSocket>> = new Map();

  subscribe(ws: WebSocket, channel: Channel): void {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }
    this.subscriptions.get(channel)!.add(ws);
  }

  unsubscribe(ws: WebSocket, channel: Channel): void {
    this.subscriptions.get(channel)?.delete(ws);
  }

  removeClient(ws: WebSocket): void {
    for (const subscribers of this.subscriptions.values()) {
      subscribers.delete(ws);
    }
  }

  broadcast(channel: Channel, message: ServerMessage): void {
    const subscribers = this.subscriptions.get(channel);
    if (!subscribers) return;

    const json = JSON.stringify(message);
    for (const ws of subscribers) {
      if (ws.readyState === ws.OPEN) {
        ws.send(json);
      }
    }
  }

  broadcastBinary(channel: Channel, metadata: ServerMessage, data: Buffer): void {
    const subscribers = this.subscriptions.get(channel);
    if (!subscribers) return;

    const json = JSON.stringify(metadata);
    for (const ws of subscribers) {
      if (ws.readyState === ws.OPEN) {
        ws.send(json);
        ws.send(data);
      }
    }
  }
}
