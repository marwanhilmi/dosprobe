import { useEffect, useRef, useState } from 'react';
import type { DosboxLaunchConfig, QemuLaunchConfig } from '../../types/api';
import { launch, selectBackend, getLaunchDefaults } from '../../lib/api';
import { useBackend } from '../../contexts/BackendContext';
import { clsx } from 'clsx';

interface LaunchDialogProps {
  open: boolean;
  onClose: () => void;
  backendType: 'qemu' | 'dosbox';
}

// ── Shared field component ──

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid grid-cols-[140px_1fr] items-center gap-2">
      <span className="text-text-secondary text-xs text-right">{label}</span>
      <div>{children}</div>
    </label>
  );
}

const inputClass = 'w-full bg-bg-tertiary border border-border-default rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent-blue';
const selectClass = inputClass;

// ── QEMU form ──

function QemuForm({ config, onChange }: { config: QemuLaunchConfig; onChange: (c: QemuLaunchConfig) => void }) {
  function set<K extends keyof QemuLaunchConfig>(key: K, value: QemuLaunchConfig[K]) {
    onChange({ ...config, [key]: value });
  }

  return (
    <div className="space-y-2">
      <Field label="Mode">
        <select className={selectClass} value={config.mode} onChange={(e) => set('mode', e.target.value as QemuLaunchConfig['mode'])}>
          <option value="interactive">Interactive</option>
          <option value="headless">Headless</option>
          <option value="record">Record</option>
          <option value="replay">Replay</option>
        </select>
      </Field>
      <Field label="Disk Image *">
        <input className={inputClass} value={config.diskImage} onChange={(e) => set('diskImage', e.target.value)} placeholder="/path/to/disk.img" />
      </Field>
      <Field label="Shared ISO">
        <input className={inputClass} value={config.sharedIso ?? ''} onChange={(e) => set('sharedIso', e.target.value || undefined)} placeholder="/path/to/shared.iso" />
      </Field>
      <Field label="Game ISO">
        <input className={inputClass} value={config.gameIso ?? ''} onChange={(e) => set('gameIso', e.target.value || undefined)} placeholder="/path/to/game.iso" />
      </Field>
      <Field label="Display">
        <select className={selectClass} value={config.display ?? 'cocoa'} onChange={(e) => set('display', e.target.value as 'cocoa' | 'none')}>
          <option value="cocoa">Cocoa</option>
          <option value="none">None (headless)</option>
        </select>
      </Field>
      <Field label="RAM (MB)">
        <input className={inputClass} type="number" value={config.ram ?? 64} onChange={(e) => set('ram', Number(e.target.value) || undefined)} />
      </Field>
      <Field label="CPU">
        <input className={inputClass} value={config.cpu ?? ''} onChange={(e) => set('cpu', e.target.value || undefined)} placeholder="e.g. 486" />
      </Field>
      <Field label="Accelerator">
        <input className={inputClass} value={config.accel ?? ''} onChange={(e) => set('accel', e.target.value || undefined)} placeholder="e.g. hvf, tcg" />
      </Field>
      <Field label="GDB Port">
        <input className={inputClass} type="number" value={config.gdbPort ?? 1234} onChange={(e) => set('gdbPort', Number(e.target.value) || undefined)} />
      </Field>
      <Field label="QMP Socket">
        <input className={inputClass} value={config.qmpSocketPath ?? ''} onChange={(e) => set('qmpSocketPath', e.target.value || undefined)} placeholder="/tmp/qmp.sock" />
      </Field>
      <Field label="VNC Port">
        <input className={inputClass} type="number" value={config.vncPort ?? ''} onChange={(e) => set('vncPort', Number(e.target.value) || undefined)} />
      </Field>
      <Field label="Snapshot">
        <input className={inputClass} value={config.snapshot ?? ''} onChange={(e) => set('snapshot', e.target.value || undefined)} placeholder="snapshot name" />
      </Field>
      <Field label="Record File">
        <input className={inputClass} value={config.recordFile ?? ''} onChange={(e) => set('recordFile', e.target.value || undefined)} placeholder="/path/to/record.bin" />
      </Field>
      <Field label="Serial Log">
        <input className={inputClass} value={config.serialLogPath ?? ''} onChange={(e) => set('serialLogPath', e.target.value || undefined)} placeholder="/path/to/serial.log" />
      </Field>
      <Field label="Audio">
        <input type="checkbox" checked={config.audio ?? false} onChange={(e) => set('audio', e.target.checked)} className="accent-accent-blue" />
      </Field>
    </div>
  );
}

// ── DOSBox-X form ──

function DosboxForm({ config, onChange }: { config: DosboxLaunchConfig; onChange: (c: DosboxLaunchConfig) => void }) {
  function set<K extends keyof DosboxLaunchConfig>(key: K, value: DosboxLaunchConfig[K]) {
    onChange({ ...config, [key]: value });
  }

  return (
    <div className="space-y-2">
      <Field label="Mode">
        <select className={selectClass} value={config.mode} onChange={(e) => set('mode', e.target.value as DosboxLaunchConfig['mode'])}>
          <option value="interactive">Interactive</option>
          <option value="debug">Debug</option>
          <option value="game">Game</option>
          <option value="capture">Capture</option>
        </select>
      </Field>
      <Field label="Drive C Path *">
        <input className={inputClass} value={config.driveCPath} onChange={(e) => set('driveCPath', e.target.value)} placeholder="/path/to/drive_c" />
      </Field>
      <Field label="Game Executable">
        <input className={inputClass} value={config.gameExe ?? ''} onChange={(e) => set('gameExe', e.target.value || undefined)} placeholder="GAME.EXE" />
      </Field>
      <Field label="Game ISO">
        <input className={inputClass} value={config.gameIso ?? ''} onChange={(e) => set('gameIso', e.target.value || undefined)} placeholder="/path/to/game.iso" />
      </Field>
      <Field label="DOSBox-X Binary">
        <input className={inputClass} value={config.dosboxBin ?? ''} onChange={(e) => set('dosboxBin', e.target.value || undefined)} placeholder="dosbox-x" />
      </Field>
      <Field label="Output">
        <input className={inputClass} value={config.output ?? ''} onChange={(e) => set('output', e.target.value || undefined)} placeholder="e.g. surface" />
      </Field>
      <Field label="Config Path">
        <input className={inputClass} value={config.configPath ?? ''} onChange={(e) => set('configPath', e.target.value || undefined)} placeholder="/path/to/dosbox-x.conf" />
      </Field>
      <Field label="Debug Run File">
        <input className={inputClass} value={config.debugRunFile ?? ''} onChange={(e) => set('debugRunFile', e.target.value || undefined)} placeholder="/path/to/debug.run" />
      </Field>
      <Field label="Log File">
        <input className={inputClass} value={config.logFile ?? ''} onChange={(e) => set('logFile', e.target.value || undefined)} placeholder="/path/to/dosbox.log" />
      </Field>
      <Field label="Timeout (s)">
        <input className={inputClass} type="number" value={config.timeout ?? ''} onChange={(e) => set('timeout', Number(e.target.value) || undefined)} />
      </Field>
      <Field label="Start Debugger">
        <input type="checkbox" checked={config.startDebugger ?? false} onChange={(e) => set('startDebugger', e.target.checked)} className="accent-accent-blue" />
      </Field>
    </div>
  );
}

// ── Main dialog ──

const DEFAULT_QEMU: QemuLaunchConfig = {
  type: 'qemu',
  mode: 'interactive',
  diskImage: '',
  ram: 64,
  gdbPort: 1234,
  display: 'cocoa',
};

const DEFAULT_DOSBOX: DosboxLaunchConfig = {
  type: 'dosbox',
  mode: 'interactive',
  driveCPath: '',
};

export function LaunchDialog({ open, onClose, backendType }: LaunchDialogProps) {
  const { refresh } = useBackend();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [qemuConfig, setQemuConfig] = useState<QemuLaunchConfig>(DEFAULT_QEMU);
  const [dosboxConfig, setDosboxConfig] = useState<DosboxLaunchConfig>(DEFAULT_DOSBOX);
  const [error, setError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const defaultsLoaded = useRef(false);

  // Fetch server-side launch defaults once
  useEffect(() => {
    if (defaultsLoaded.current) return;
    defaultsLoaded.current = true;
    getLaunchDefaults()
      .then((defaults) => {
        setQemuConfig((prev) => ({
          ...prev,
          diskImage: prev.diskImage || defaults.qemu.diskImage,
          sharedIso: prev.sharedIso || defaults.qemu.sharedIso,
          qmpSocketPath: prev.qmpSocketPath || defaults.qemu.qmpSocketPath,
        }));
        setDosboxConfig((prev) => ({
          ...prev,
          driveCPath: prev.driveCPath || defaults.dosbox.driveCPath,
        }));
      })
      .catch(() => { /* server may not have defaults configured */ });
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Close on backdrop click
  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      onClose();
    }
  }

  async function handleLaunch() {
    setError(null);
    setLaunching(true);
    const config = backendType === 'qemu' ? qemuConfig : dosboxConfig;

    // Basic validation
    if (backendType === 'qemu' && !qemuConfig.diskImage.trim()) {
      setError('Disk image path is required');
      setLaunching(false);
      return;
    }
    if (backendType === 'dosbox' && !dosboxConfig.driveCPath.trim()) {
      setError('Drive C path is required');
      setLaunching(false);
      return;
    }

    try {
      // Ensure backend type is selected on the server before launching
      await selectBackend(backendType);
      await launch(config);
      refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Launch failed');
    } finally {
      setLaunching(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className={clsx(
        'bg-bg-panel border border-border-default rounded-lg shadow-2xl',
        'text-text-primary p-0 w-[520px] max-h-[80vh]',
        'backdrop:bg-black/60',
      )}
    >
      <div className="flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default bg-bg-secondary shrink-0">
          <h2 className="text-sm font-semibold">
            Launch {backendType === 'qemu' ? 'QEMU' : 'DOSBox-X'}
          </h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary text-lg leading-none">&times;</button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-4">
          {backendType === 'qemu' ? (
            <QemuForm config={qemuConfig} onChange={setQemuConfig} />
          ) : (
            <DosboxForm config={dosboxConfig} onChange={setDosboxConfig} />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border-default bg-bg-secondary shrink-0">
          <div className="text-xs text-accent-red min-h-[1em]">{error ?? ''}</div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs bg-bg-tertiary border border-border-default rounded hover:border-text-muted"
            >
              Cancel
            </button>
            <button
              onClick={handleLaunch}
              disabled={launching}
              className="px-3 py-1.5 text-xs bg-accent-green/20 border border-accent-green/50 text-accent-green rounded hover:bg-accent-green/30 disabled:opacity-50"
            >
              {launching ? 'Launching...' : 'Launch'}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
