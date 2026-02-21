import type { ChannelManager } from '../channels.ts';

export function emitCaptureProgress(
  channels: ChannelManager,
  captureId: string,
  stage: string,
  detail?: string,
): void {
  channels.broadcast('capture', {
    type: 'capture:progress',
    captureId,
    stage,
    detail,
    timestamp: Date.now(),
  });
}

export function emitCaptureComplete(
  channels: ChannelManager,
  captureId: string,
): void {
  channels.broadcast('capture', {
    type: 'capture:complete',
    captureId,
    timestamp: Date.now(),
  });
}
