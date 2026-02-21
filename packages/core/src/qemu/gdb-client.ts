import { createConnection, type Socket } from 'node:net';
import { ConnectionError, TimeoutError, ProtocolError } from '@dosprobe/shared';
import type { Registers } from '../types.ts';

const REG_NAMES_32 = [
  'eax', 'ecx', 'edx', 'ebx', 'esp', 'ebp', 'esi', 'edi', 'eip', 'eflags',
] as const;

const REG_NAMES_16 = ['cs', 'ss', 'ds', 'es', 'fs', 'gs'] as const;

const CHUNK_SIZE = 4096;

export class GdbClient {
  private socket: Socket | null = null;
  private buffer = Buffer.alloc(0);
  readonly host: string;
  readonly port: number;

  constructor(host = 'localhost', port = 1234) {
    this.host = host;
    this.port = port;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = createConnection({ host: this.host, port: this.port });
      this.socket.on('data', (chunk: Buffer) => {
        this.buffer = Buffer.concat([this.buffer, chunk]);
      });
      this.socket.once('connect', () => resolve());
      this.socket.once('error', (err) => {
        reject(new ConnectionError(`GDB connection error: ${err.message}`));
      });
    });
  }

  async readMemory(addr: number, length: number): Promise<Buffer> {
    const result: Buffer[] = [];
    for (let offset = 0; offset < length; offset += CHUNK_SIZE) {
      const remaining = Math.min(CHUNK_SIZE, length - offset);
      const resp = await this.command(
        `m${(addr + offset).toString(16)},${remaining.toString(16)}`,
      );
      if (resp.startsWith('E')) {
        throw new ProtocolError(
          `GDB memory read error at 0x${(addr + offset).toString(16)}: ${resp}`,
        );
      }
      result.push(Buffer.from(resp, 'hex'));
    }
    return Buffer.concat(result);
  }

  async writeMemory(addr: number, data: Buffer): Promise<void> {
    const resp = await this.command(
      `M${addr.toString(16)},${data.length.toString(16)}:${data.toString('hex')}`,
    );
    if (resp !== 'OK') {
      throw new ProtocolError(`GDB memory write error: ${resp}`);
    }
  }

  async readRegisters(): Promise<Registers> {
    const resp = await this.command('g');
    if (resp.startsWith('E')) {
      throw new ProtocolError(`GDB register read error: ${resp}`);
    }

    const raw = Buffer.from(resp, 'hex');
    const regs: Partial<Registers> = {};

    for (let i = 0; i < REG_NAMES_32.length; i++) {
      (regs as Record<string, number>)[REG_NAMES_32[i]] = raw.readUInt32LE(i * 4);
    }
    for (let i = 0; i < REG_NAMES_16.length; i++) {
      (regs as Record<string, number>)[REG_NAMES_16[i]] =
        raw.readUInt32LE((10 + i) * 4) & 0xffff;
    }

    return regs as Registers;
  }

  async setBreakpoint(addr: number): Promise<void> {
    const resp = await this.command(`Z0,${addr.toString(16)},1`);
    if (resp !== 'OK') {
      throw new ProtocolError(
        `Failed to set breakpoint at 0x${addr.toString(16)}: ${resp}`,
      );
    }
  }

  async removeBreakpoint(addr: number): Promise<void> {
    await this.command(`z0,${addr.toString(16)},1`);
  }

  continueExecution(): void {
    this.sendPacket('c');
  }

  stop(): void {
    if (!this.socket) throw new ConnectionError('GDB not connected');
    this.socket.write(Buffer.from([0x03]));
  }

  async waitForStop(timeoutMs = 30_000): Promise<string> {
    return this.recvPacket(timeoutMs);
  }

  async step(): Promise<string> {
    return this.command('s');
  }

  close(): void {
    this.socket?.destroy();
    this.socket = null;
  }

  private async command(cmd: string): Promise<string> {
    await this.consumePendingAck();
    this.sendPacket(cmd);
    return this.recvPacket();
  }

  private sendPacket(data: string): void {
    if (!this.socket) throw new ConnectionError('GDB not connected');
    const checksum =
      [...Buffer.from(data)].reduce((sum, b) => sum + b, 0) % 256;
    const packet = `$${data}#${checksum.toString(16).padStart(2, '0')}`;
    this.socket.write(packet);
  }

  private recvPacket(timeoutMs = 10_000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new TimeoutError('GDB recv timeout')),
        timeoutMs,
      );

      const tryParse = (): void => {
        const str = this.buffer.toString('ascii');
        const dollarIdx = str.indexOf('$');
        if (dollarIdx === -1) {
          this.socket!.once('data', tryParse);
          return;
        }
        const hashIdx = str.indexOf('#', dollarIdx);
        if (hashIdx === -1 || hashIdx + 2 >= str.length) {
          this.socket!.once('data', tryParse);
          return;
        }
        clearTimeout(timer);
        const payload = str.substring(dollarIdx + 1, hashIdx);
        this.buffer = this.buffer.subarray(hashIdx + 3);
        // Send ACK
        this.socket!.write('+');
        resolve(payload);
      };
      tryParse();
    });
  }

  private consumePendingAck(): Promise<void> {
    return new Promise((resolve) => {
      // Brief wait to consume a pending ACK byte
      const timer = setTimeout(() => resolve(), 50);

      if (this.buffer.length > 0 && this.buffer[0] === 0x2b) {
        // '+' ACK
        this.buffer = this.buffer.subarray(1);
        clearTimeout(timer);
        resolve();
      } else if (this.buffer.length > 0) {
        clearTimeout(timer);
        resolve();
      }
    });
  }
}
