import { EventEmitter } from 'node:events';
import type {
  Registers,
  DosAddress,
  Breakpoint,
  BreakpointType,
  CaptureRequest,
  CaptureResult,
  Snapshot,
  BackendInfo,
  LaunchConfig,
} from './types.ts';

export abstract class Backend extends EventEmitter {
  abstract readonly type: 'qemu' | 'dosbox';

  abstract status(): BackendInfo;

  abstract launch(config: LaunchConfig): Promise<void>;

  abstract disconnect(): void;

  abstract shutdown(): Promise<void>;

  abstract readMemory(address: DosAddress, size: number): Promise<Buffer>;

  abstract writeMemory(address: DosAddress, data: Buffer): Promise<void>;

  abstract readRegisters(): Promise<Registers>;

  abstract sendKeys(keys: string[], delay?: number): Promise<void>;

  abstract screenshot(): Promise<{ data: Buffer; format: string }>;

  abstract setBreakpoint(
    type: BreakpointType,
    address: DosAddress,
  ): Promise<Breakpoint>;

  abstract removeBreakpoint(id: string): Promise<void>;

  abstract listBreakpoints(): Promise<Breakpoint[]>;

  abstract pause(): Promise<void>;

  abstract resume(): Promise<void>;

  abstract step(): Promise<Registers>;

  abstract saveSnapshot(name: string): Promise<Snapshot>;

  abstract loadSnapshot(name: string): Promise<void>;

  abstract listSnapshots(): Promise<Snapshot[]>;

  abstract capture(request: CaptureRequest): Promise<CaptureResult>;
}
