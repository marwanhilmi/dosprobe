import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { Backend } from '../backend.ts';
import type {
  Registers,
  DosAddress,
  Breakpoint,
  BreakpointType,
  CaptureRequest,
  CaptureResult,
  Snapshot,
  BackendInfo,
  BackendStatus,
  LaunchConfig,
  QemuLaunchConfig,
} from '../types.ts';
import { QmpClient } from './qmp-client.ts';
import { GdbClient } from './gdb-client.ts';
import { QemuLauncher } from './qemu-launcher.ts';
import { CapturePipeline } from '../capture/capture-pipeline.ts';

let nextBpId = 1;

export class QemuBackend extends Backend {
  readonly type = 'qemu' as const;
  private qmp: QmpClient | null = null;
  private gdb: GdbClient | null = null;
  private launcher: QemuLauncher | null = null;
  private currentStatus: BackendStatus = 'disconnected';
  private breakpoints: Map<string, { address: number; bp: Breakpoint }> = new Map();
  private capturesDir: string;
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(capturesDir: string) {
    super();
    this.capturesDir = capturesDir;
  }

  status(): BackendInfo {
    return {
      type: 'qemu',
      status: this.currentStatus,
      pid: this.launcher?.getPid(),
      connections: {
        qmp: this.qmp !== null,
        gdb: this.gdb !== null,
      },
    };
  }

  async launch(config: LaunchConfig): Promise<void> {
    if (config.type !== 'qemu') throw new Error('Expected QEMU launch config');
    const qemuConfig = config as QemuLaunchConfig;

    this.currentStatus = 'launching';
    this.launcher = new QemuLauncher();
    await this.launcher.launch(qemuConfig);

    // Connect QMP — retry until the socket is ready
    if (qemuConfig.qmpSocketPath) {
      this.qmp = await this.connectWithRetry(
        () => {
          const client = new QmpClient(qemuConfig.qmpSocketPath!);
          return client.connect().then(() => client);
        },
        'QMP',
      );
    }

    // Connect GDB — retry until the stub is ready
    this.gdb = await this.connectWithRetry(
      () => {
        const client = new GdbClient('localhost', qemuConfig.gdbPort ?? 1234);
        return client.connect().then(() => client);
      },
      'GDB',
    );

    this.currentStatus = 'running';
    this.emit('status', this.currentStatus);
  }

  private async connectWithRetry<T>(factory: () => Promise<T>, label: string): Promise<T> {
    const maxAttempts = 20;
    const delayMs = 500;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await factory();
      } catch (err) {
        if (attempt === maxAttempts) {
          throw new Error(`Failed to connect ${label} after ${maxAttempts} attempts: ${err instanceof Error ? err.message : err}`);
        }
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    throw new Error(`Unreachable`);
  }

  async connectToRunning(qmpSocketPath: string, gdbHost = 'localhost', gdbPort = 1234): Promise<void> {
    this.qmp = new QmpClient(qmpSocketPath);
    await this.qmp.connect();
    this.gdb = new GdbClient(gdbHost, gdbPort);
    await this.gdb.connect();
    this.currentStatus = 'running';
    this.emit('status', this.currentStatus);
  }

  /** Close connections without terminating QEMU. Use for CLI commands against an already-running instance. */
  disconnect(): void {
    if (this.qmp) {
      this.qmp.close();
      this.qmp = null;
    }
    if (this.gdb) {
      this.gdb.close();
      this.gdb = null;
    }
    this.currentStatus = 'disconnected';
    this.emit('status', this.currentStatus);
  }

  /** Terminate QEMU and close all connections. Use only when this process owns the QEMU instance. */
  async shutdown(): Promise<void> {
    if (this.qmp) {
      try { await this.qmp.quit(); } catch { /* ignore */ }
    }
    this.disconnect();
    this.launcher?.kill();
    this.launcher = null;
  }

  async readMemory(address: DosAddress, size: number): Promise<Buffer> {
    return this.runExclusive(async () => {
      this.requireGdb();
      return this.gdb!.readMemory(address.linear, size);
    });
  }

  async writeMemory(address: DosAddress, data: Buffer): Promise<void> {
    await this.runExclusive(async () => {
      this.requireGdb();
      await this.gdb!.writeMemory(address.linear, data);
    });
  }

  async readRegisters(): Promise<Registers> {
    return this.runExclusive(async () => {
      this.requireGdb();
      return this.gdb!.readRegisters();
    });
  }

  async sendKeys(keys: string[], delay = 150): Promise<void> {
    await this.runExclusive(async () => {
      this.requireQmp();
      await this.qmp!.sendKeysSequence(keys, delay);
    });
  }

  async screenshot(): Promise<{ data: Buffer; format: string }> {
    return this.runExclusive(async () => {
      this.requireQmp();
      const path = join(this.capturesDir, `_screenshot_${Date.now()}.ppm`);
      await this.qmp!.screendump(path);
      const data = readFileSync(path);
      return { data, format: 'ppm' };
    });
  }

  async setBreakpoint(type: BreakpointType, address: DosAddress): Promise<Breakpoint> {
    return this.runExclusive(async () => {
      this.requireGdb();
      if (type !== 'execution') {
        throw new Error(`QEMU GDB only supports execution breakpoints, got: ${type}`);
      }
      await this.gdb!.setBreakpoint(address.linear);
      const id = `bp_${nextBpId++}`;
      const bp: Breakpoint = { id, type, address, enabled: true };
      this.breakpoints.set(id, { address: address.linear, bp });
      return bp;
    });
  }

  async removeBreakpoint(id: string): Promise<void> {
    await this.runExclusive(async () => {
      this.requireGdb();
      const entry = this.breakpoints.get(id);
      if (entry) {
        await this.gdb!.removeBreakpoint(entry.address);
        this.breakpoints.delete(id);
      }
    });
  }

  async listBreakpoints(): Promise<Breakpoint[]> {
    return this.runExclusive(async () =>
      Array.from(this.breakpoints.values()).map((e) => e.bp));
  }

  async pause(): Promise<void> {
    await this.runExclusive(async () => {
      this.requireGdb();
      this.gdb!.stop();
      await this.gdb!.waitForStop(5000);
      this.currentStatus = 'paused';
      this.emit('status', this.currentStatus);
    });
  }

  async resume(): Promise<void> {
    await this.runExclusive(async () => {
      this.requireGdb();
      this.gdb!.continueExecution();
      this.currentStatus = 'running';
      this.emit('status', this.currentStatus);
    });
  }

  async step(): Promise<Registers> {
    return this.runExclusive(async () => {
      this.requireGdb();
      await this.gdb!.step();
      return this.gdb!.readRegisters();
    });
  }

  async saveSnapshot(name: string): Promise<Snapshot> {
    return this.runExclusive(async () => {
      this.requireQmp();
      await this.qmp!.saveSnapshot(name);
      return { name, backend: 'qemu' };
    });
  }

  async loadSnapshot(name: string): Promise<void> {
    await this.runExclusive(async () => {
      this.requireQmp();
      this.currentStatus = 'paused';
      this.emit('status', this.currentStatus);
      this.emit('snapshot:loading', { name, timestamp: Date.now() });
      try {
        await this.qmp!.loadSnapshot(name);
        this.breakpoints.clear();
        await this.qmp!.execute('cont');
        this.currentStatus = 'running';
        this.emit('status', this.currentStatus);
        this.emit('snapshot:loaded', { name, timestamp: Date.now() });
      } catch (error) {
        this.emit('snapshot:load-failed', {
          name,
          timestamp: Date.now(),
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    });
  }

  async listSnapshots(): Promise<Snapshot[]> {
    return this.runExclusive(async () => {
      // QEMU doesn't have a simple API to list snapshots
      // Would need to parse `info snapshots` output
      this.requireQmp();
      const resp = await this.qmp!.execute('human-monitor-command', {
        'command-line': 'info snapshots',
      });
      const output = (resp['return'] as string) ?? '';
      const snapshots: Snapshot[] = [];
      for (const line of output.split('\n')) {
        const match = line.match(/\d+\s+(\S+)\s+/);
        if (match) {
          snapshots.push({ name: match[1]!, backend: 'qemu' });
        }
      }
      return snapshots;
    });
  }

  async capture(request: CaptureRequest): Promise<CaptureResult> {
    const pipeline = new CapturePipeline(this, this.capturesDir);
    return pipeline.run(request);
  }

  getQmp(): QmpClient | null { return this.qmp; }
  getGdb(): GdbClient | null { return this.gdb; }

  private requireQmp(): void {
    if (!this.qmp) throw new Error('QMP not connected');
  }

  private requireGdb(): void {
    if (!this.gdb) throw new Error('GDB not connected');
  }

  private async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.operationQueue;
    let release!: () => void;
    this.operationQueue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}
