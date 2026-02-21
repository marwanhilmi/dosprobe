import { useState } from 'react';
import { useMemory } from '../../hooks/useMemory';
import { hexDump } from '../../lib/hex';
import { Panel } from '../layout/Panel';
import { AddressInput } from '../shared/AddressInput';

const SIZE_OPTIONS = [64, 128, 256, 512] as const;

export function MemoryPanel() {
  const [address, setAddress] = useState('0x0');
  const [size, setSize] = useState<number>(256);
  const { data, prevData, loading, error, read, watch, unwatch, watching } = useMemory();

  function handleRead() {
    read(address, size);
  }

  function handleWatch() {
    if (watching) {
      unwatch();
    } else {
      watch(address, size);
    }
  }

  const lines = data ? hexDump(data) : [];

  const toolbar = (
    <div className="flex items-center gap-1">
      <button
        onClick={handleWatch}
        className={`px-2 py-0.5 text-xs border rounded ${watching ? 'bg-accent-blue/20 border-accent-blue text-accent-blue' : 'bg-bg-tertiary border-border-default hover:border-accent-blue'}`}
      >
        {watching ? 'Unwatch' : 'Watch'}
      </button>
    </div>
  );

  return (
    <Panel title="Memory" toolbar={toolbar}>
      <div className="flex items-center gap-2 mb-2">
        <AddressInput
          value={address}
          onChange={setAddress}
          onSubmit={handleRead}
          className="w-24"
        />
        <select
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
          className="bg-bg-tertiary border border-border-default rounded px-1 py-1 text-xs text-text-primary"
        >
          {SIZE_OPTIONS.map((s) => (
            <option key={s} value={s}>{s} bytes</option>
          ))}
        </select>
        <button
          onClick={handleRead}
          disabled={loading}
          className="px-2 py-0.5 text-xs bg-bg-tertiary border border-border-default rounded hover:border-accent-blue disabled:opacity-50"
        >
          {loading ? '...' : 'Read'}
        </button>
      </div>

      {error && <div className="text-accent-red text-xs mb-2">{error}</div>}

      {lines.length > 0 ? (
        <div className="font-mono text-[11px] leading-[18px]">
          {lines.map((line) => (
            <div key={line.offset} className="flex">
              <span className="text-text-muted w-[60px] shrink-0 text-right pr-2">
                {line.offset.toString(16).padStart(4, '0')}
              </span>
              <span className="flex-1">
                {line.hex.map((byte, i) => {
                  const globalIdx = line.offset + i;
                  const changed = prevData && data && prevData[globalIdx] !== data[globalIdx];
                  return (
                    <span
                      key={i}
                      className={`inline-block w-[22px] text-center ${changed ? 'animate-flash-changed' : ''}`}
                    >
                      {byte}
                    </span>
                  );
                })}
                {/* Pad missing bytes in last line */}
                {line.hex.length < 16 && (
                  <span className="inline-block" style={{ width: `${(16 - line.hex.length) * 22}px` }} />
                )}
              </span>
              <span className="text-text-muted pl-2 shrink-0">
                {line.ascii.split('').map((ch, i) => {
                  const globalIdx = line.offset + i;
                  const changed = prevData && data && prevData[globalIdx] !== data[globalIdx];
                  return (
                    <span key={i} className={changed ? 'animate-flash-changed' : ''}>
                      {ch}
                    </span>
                  );
                })}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center h-32 text-text-muted text-xs">
          Enter an address and click Read
        </div>
      )}
    </Panel>
  );
}
