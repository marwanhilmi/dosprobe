import { useState } from 'react';
import { useBackend } from '../../contexts/BackendContext';
import { selectBackend, shutdown } from '../../lib/api';
import { Panel } from '../layout/Panel';
import { ConnectionDot } from '../shared/ConnectionDot';
import { LaunchDialog } from './LaunchDialog';

export function BackendPanel() {
  const { backend, refresh } = useBackend();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [selectError, setSelectError] = useState<string | null>(null);
  // Local selection tracks the chosen backend type even before the server confirms
  const [selectedType, setSelectedType] = useState<'qemu' | 'dosbox' | ''>(backend?.type ?? '');

  const activeType = backend?.type ?? selectedType;
  const isActive = backend?.status === 'running' || backend?.status === 'paused' || backend?.status === 'launching';

  async function handleSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value as 'qemu' | 'dosbox';
    setSelectedType(value);
    setSelectError(null);
    try {
      await selectBackend(value);
      refresh();
    } catch (err) {
      setSelectError(err instanceof Error ? err.message : 'Failed to select backend');
    }
  }

  async function handleStop() {
    setStopping(true);
    try {
      await shutdown();
      refresh();
    } finally {
      setStopping(false);
    }
  }

  return (
    <Panel title="Backend">
      <div className="space-y-3 text-xs">
        <div className="flex items-center gap-2">
          <label className="text-text-secondary">Backend:</label>
          <select
            value={activeType}
            onChange={handleSelect}
            disabled={isActive}
            className="bg-bg-tertiary border border-border-default rounded px-2 py-1 text-text-primary text-xs disabled:opacity-50"
          >
            <option value="" disabled>Select...</option>
            <option value="qemu">QEMU</option>
            <option value="dosbox">DOSBox-X</option>
          </select>
        </div>

        {selectError && (
          <div className="text-accent-red text-xs">{selectError}</div>
        )}

        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <span className="text-text-secondary">Status:</span>
          <span className="flex items-center gap-1.5">
            <ConnectionDot status={backend?.status ?? 'disconnected'} />
            {backend?.status ?? 'disconnected'}
          </span>

          {backend?.pid && (
            <>
              <span className="text-text-secondary">PID:</span>
              <span>{backend.pid}</span>
            </>
          )}

          {backend?.connections?.qmp !== undefined && (
            <>
              <span className="text-text-secondary">QMP:</span>
              <span className={backend.connections.qmp ? 'text-accent-green' : 'text-text-muted'}>
                {backend.connections.qmp ? 'connected' : 'disconnected'}
              </span>
            </>
          )}

          {backend?.connections?.gdb !== undefined && (
            <>
              <span className="text-text-secondary">GDB:</span>
              <span className={backend.connections.gdb ? 'text-accent-green' : 'text-text-muted'}>
                {backend.connections.gdb ? 'connected' : 'disconnected'}
              </span>
            </>
          )}
        </div>

        {/* Launch / Stop buttons */}
        <div className="flex items-center gap-2 pt-1 border-t border-border-default">
          {isActive ? (
            <button
              onClick={handleStop}
              disabled={stopping}
              className="px-3 py-1 text-xs bg-accent-red/15 border border-accent-red/40 text-accent-red rounded hover:bg-accent-red/25 disabled:opacity-50"
            >
              {stopping ? 'Stopping...' : 'Stop'}
            </button>
          ) : (
            <button
              onClick={() => setDialogOpen(true)}
              disabled={!activeType}
              className="px-3 py-1 text-xs bg-accent-green/15 border border-accent-green/40 text-accent-green rounded hover:bg-accent-green/25 disabled:opacity-40"
            >
              Launch...
            </button>
          )}
        </div>
      </div>

      <LaunchDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        backendType={activeType || 'qemu'}
      />
    </Panel>
  );
}
