import { createConnection, type Socket } from 'node:net';
import { WebSocketServer, WebSocket } from 'ws';
import type { Backend } from '@dosprobe/core';

export function createVncProxy(): WebSocketServer {
  return new WebSocketServer({ noServer: true });
}

export function bridgeVnc(ws: WebSocket, backend: Backend): void {
  const vncPort = backend.status().vncPort;
  if (!vncPort) {
    ws.close(1011, 'No VNC port configured');
    return;
  }

  const tcp: Socket = createConnection({ host: '127.0.0.1', port: vncPort });

  tcp.on('data', (data: Buffer) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });

  ws.on('message', (data: Buffer) => {
    if (!tcp.destroyed) {
      tcp.write(data);
    }
  });

  tcp.on('error', () => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1011, 'VNC connection error');
    }
  });

  tcp.on('close', () => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1000, 'VNC connection closed');
    }
  });

  ws.on('close', () => {
    tcp.destroy();
  });

  ws.on('error', () => {
    tcp.destroy();
  });
}
