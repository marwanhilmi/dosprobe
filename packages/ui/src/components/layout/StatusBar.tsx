import { useBackend } from '../../contexts/BackendContext';
import { useWebSocket } from '../../contexts/WebSocketContext';
import { ConnectionDot } from '../shared/ConnectionDot';

export function StatusBar() {
  const { backend } = useBackend();
  const { connected } = useWebSocket();

  return (
    <div className="flex items-center gap-4 px-3 py-1 bg-bg-secondary border-t border-border-default text-xs text-text-secondary">
      <div className="flex items-center gap-1.5">
        <ConnectionDot status={backend?.status ?? 'disconnected'} />
        <span>{backend?.type ?? 'no backend'}</span>
        <span className="text-text-muted">({backend?.status ?? 'disconnected'})</span>
      </div>

      {backend?.connections && (
        <div className="flex items-center gap-2 text-text-muted">
          {backend.connections.qmp !== undefined && (
            <span>QMP: {backend.connections.qmp ? 'ok' : 'n/a'}</span>
          )}
          {backend.connections.gdb !== undefined && (
            <span>GDB: {backend.connections.gdb ? 'ok' : 'n/a'}</span>
          )}
        </div>
      )}

      {backend?.pid && <span className="text-text-muted">PID {backend.pid}</span>}

      <div className="ml-auto flex items-center gap-1.5">
        <ConnectionDot status={connected ? 'connected' : 'disconnected'} />
        <span>WS {connected ? 'connected' : 'disconnected'}</span>
      </div>
    </div>
  );
}
