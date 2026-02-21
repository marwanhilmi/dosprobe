import { createConnection, type Socket } from 'node:net';
import { EventEmitter } from 'node:events';
import { ConnectionError, ProtocolError } from '@dosprobe/shared';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class QmpClient extends EventEmitter {
  private socket: Socket | null = null;
  private buffer = '';
  private pendingResolves: Array<(value: Record<string, unknown>) => void> = [];
  readonly socketPath: string;

  constructor(socketPath: string) {
    super();
    this.socketPath = socketPath;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = createConnection(this.socketPath);
      this.socket.setEncoding('utf-8');

      this.socket.on('data', (chunk: string) => {
        this.buffer += chunk;
        this.tryParsePending();
      });

      this.socket.on('error', (err) => {
        reject(new ConnectionError(`QMP socket error: ${err.message}`));
      });

      // Wait for greeting, then negotiate
      this.waitForJson().then(async (greeting) => {
        if (!('QMP' in greeting)) {
          reject(new ProtocolError(`Bad QMP greeting: ${JSON.stringify(greeting)}`));
          return;
        }
        await this.execute('qmp_capabilities');
        resolve();
      }).catch(reject);
    });
  }

  async execute(command: string, args?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const msg: Record<string, unknown> = { execute: command };
    if (args) {
      msg['arguments'] = args;
    }
    this.send(msg);

    // Skip events, wait for return/error
    while (true) {
      const resp = await this.waitForJson();
      if ('return' in resp || 'error' in resp) {
        if ('error' in resp) {
          const err = resp['error'] as { class: string; desc: string };
          throw new ProtocolError(`QMP error (${err.class}): ${err.desc}`);
        }
        return resp;
      }
      // It's an event — emit and continue
      this.emit('event', resp);
    }
  }

  async sendKey(key: string, holdMs = 100): Promise<void> {
    await this.execute('send-key', {
      keys: [{ type: 'qcode', data: key }],
      'hold-time': holdMs,
    });
  }

  async sendKeysSequence(keys: string[], delayMs = 150): Promise<void> {
    for (const key of keys) {
      await this.sendKey(key);
      await sleep(delayMs);
    }
  }

  async screendump(path: string): Promise<void> {
    await this.execute('screendump', { filename: path });
  }

  async saveSnapshot(name: string): Promise<void> {
    await this.execute('human-monitor-command', {
      'command-line': `savevm ${name}`,
    });
    // savevm pauses vCPUs — resume them
    await this.execute('cont');
  }

  async loadSnapshot(name: string): Promise<void> {
    await this.execute('human-monitor-command', {
      'command-line': `loadvm ${name}`,
    });
  }

  async dumpMemory(addr: number, size: number, path: string): Promise<void> {
    await this.execute('human-monitor-command', {
      'command-line': `pmemsave ${addr} ${size} ${path}`,
    });
  }

  async quit(): Promise<void> {
    await this.execute('quit');
  }

  close(): void {
    this.socket?.destroy();
    this.socket = null;
  }

  private send(data: unknown): void {
    if (!this.socket) throw new ConnectionError('QMP socket not connected');
    this.socket.write(JSON.stringify(data) + '\n');
  }

  private waitForJson(): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      this.pendingResolves.push(resolve);
      this.tryParsePending();
    });
  }

  private tryParsePending(): void {
    while (this.pendingResolves.length > 0 && this.buffer.length > 0) {
      // Try to find a complete JSON object in the buffer
      // QMP sends one JSON object per line
      const newlineIdx = this.buffer.indexOf('\n');
      if (newlineIdx === -1) {
        // Try parsing the whole buffer as JSON (last message may not have newline)
        try {
          const result = JSON.parse(this.buffer) as Record<string, unknown>;
          this.buffer = '';
          const resolve = this.pendingResolves.shift()!;
          resolve(result);
        } catch {
          // Incomplete JSON, wait for more data
          return;
        }
      } else {
        const line = this.buffer.substring(0, newlineIdx).trim();
        this.buffer = this.buffer.substring(newlineIdx + 1);
        if (line.length === 0) continue;
        try {
          const result = JSON.parse(line) as Record<string, unknown>;
          const resolve = this.pendingResolves.shift()!;
          resolve(result);
        } catch {
          // Skip malformed lines
          continue;
        }
      }
    }
  }
}
