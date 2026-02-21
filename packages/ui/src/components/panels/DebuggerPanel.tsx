import { useState } from 'react';
import { useExecution } from '../../hooks/useExecution';
import { useBreakpoints } from '../../hooks/useBreakpoints';
import { useBackend } from '../../contexts/BackendContext';
import { Panel } from '../layout/Panel';
import { AddressInput } from '../shared/AddressInput';
import type { BreakpointType } from '../../types/api';
import { clsx } from 'clsx';

export function DebuggerPanel() {
  const { pause, resume, step, busy } = useExecution();
  const { breakpoints, activeBreakpointId, add, remove } = useBreakpoints();
  const { isRunning, isPaused } = useBackend();

  const [bpAddress, setBpAddress] = useState('');
  const [bpType, setBpType] = useState<BreakpointType>('execution');

  async function handleAddBreakpoint() {
    if (!bpAddress.trim()) return;
    await add(bpType, bpAddress.trim());
    setBpAddress('');
  }

  return (
    <Panel title="Debugger">
      <div className="space-y-3">
        {/* Control buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => pause()}
            disabled={busy || !isRunning}
            className="px-3 py-1 text-xs bg-bg-tertiary border border-border-default rounded hover:border-accent-blue disabled:opacity-40"
          >
            Pause
          </button>
          <button
            onClick={() => resume()}
            disabled={busy || !isPaused}
            className="px-3 py-1 text-xs bg-bg-tertiary border border-border-default rounded hover:border-accent-green disabled:opacity-40"
          >
            Resume
          </button>
          <button
            onClick={() => step()}
            disabled={busy || !isPaused}
            className="px-3 py-1 text-xs bg-bg-tertiary border border-border-default rounded hover:border-accent-amber disabled:opacity-40"
          >
            Step
          </button>
        </div>

        {/* Add breakpoint */}
        <div className="border-t border-border-default pt-2">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Breakpoints</div>
          <div className="flex items-center gap-1 mb-2">
            <select
              value={bpType}
              onChange={(e) => setBpType(e.target.value as BreakpointType)}
              className="bg-bg-tertiary border border-border-default rounded px-1 py-1 text-xs text-text-primary"
            >
              <option value="execution">exec</option>
              <option value="memory">mem</option>
              <option value="interrupt">int</option>
            </select>
            <AddressInput
              value={bpAddress}
              onChange={setBpAddress}
              onSubmit={handleAddBreakpoint}
              placeholder="address"
              className="flex-1"
            />
            <button
              onClick={handleAddBreakpoint}
              className="px-2 py-1 text-xs bg-bg-tertiary border border-border-default rounded hover:border-accent-blue"
            >
              +
            </button>
          </div>

          {/* Breakpoint list */}
          {breakpoints.length === 0 ? (
            <div className="text-text-muted text-xs">No breakpoints set</div>
          ) : (
            <div className="space-y-0.5">
              {breakpoints.map((bp) => (
                <div
                  key={bp.id}
                  className={clsx(
                    'flex items-center justify-between px-2 py-0.5 rounded text-xs',
                    bp.id === activeBreakpointId ? 'bg-accent-amber/20 border border-accent-amber/50' : 'hover:bg-bg-tertiary',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-text-muted">{bp.type.slice(0, 4)}</span>
                    <span className="font-mono">
                      {bp.address
                        ? `${bp.address.segOff.segment.toString(16)}:${bp.address.segOff.offset.toString(16)}`
                        : bp.interrupt !== undefined
                        ? `INT ${bp.interrupt.toString(16)}h${bp.ah !== undefined ? ` AH=${bp.ah.toString(16)}h` : ''}`
                        : bp.id}
                    </span>
                    {bp.id === activeBreakpointId && (
                      <span className="text-accent-amber text-[10px]">HIT</span>
                    )}
                  </div>
                  <button
                    onClick={() => remove(bp.id)}
                    className="text-text-muted hover:text-accent-red"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
