import type { WebSocket } from 'ws';
import type { Backend } from '@dosprobe/core';
import type { ChannelManager } from '../channels.ts';

export async function handleExecPause(backend: Backend, ws: WebSocket): Promise<void> {
  await backend.pause();
  const registers = await backend.readRegisters();
  ws.send(JSON.stringify({
    type: 'debug:step-complete',
    registers,
    timestamp: Date.now(),
  }));
}

export async function handleExecResume(backend: Backend): Promise<void> {
  await backend.resume();
}

export async function handleExecStep(
  backend: Backend,
  ws: WebSocket,
  _channels: ChannelManager,
): Promise<void> {
  const registers = await backend.step();
  ws.send(JSON.stringify({
    type: 'debug:step-complete',
    registers,
    timestamp: Date.now(),
  }));
}
