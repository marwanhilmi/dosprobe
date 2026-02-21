/** Browser-side mirrors of @dosprobe/core types (no Node.js deps) */

export interface SegOff {
  segment: number;
  offset: number;
}

export interface DosAddress {
  linear: number;
  segOff: SegOff;
}

export interface Registers {
  eax: number;
  ecx: number;
  edx: number;
  ebx: number;
  esp: number;
  ebp: number;
  esi: number;
  edi: number;
  eip: number;
  eflags: number;
  cs: number;
  ss: number;
  ds: number;
  es: number;
  fs: number;
  gs: number;
}

export type BreakpointType = 'execution' | 'memory' | 'interrupt';

export interface Breakpoint {
  id: string;
  type: BreakpointType;
  address?: DosAddress;
  interrupt?: number;
  ah?: number;
  enabled: boolean;
}

export type BackendStatus = 'disconnected' | 'launching' | 'running' | 'paused' | 'error';

export interface BackendInfo {
  type: 'qemu' | 'dosbox';
  status: BackendStatus;
  pid?: number;
  connections?: {
    qmp?: boolean;
    gdb?: boolean;
  };
}

export interface Snapshot {
  name: string;
  backend: 'qemu' | 'dosbox';
  size?: number;
  modified?: string;
  filePath?: string;
}

export interface QemuLaunchConfig {
  type: 'qemu';
  mode: 'interactive' | 'headless' | 'record' | 'replay';
  diskImage: string;
  sharedIso?: string;
  gameIso?: string;
  accel?: string;
  cpu?: string;
  smp?: number;
  ram?: number;
  gdbPort?: number;
  qmpSocketPath?: string;
  vncPort?: number;
  display?: 'cocoa' | 'none';
  audio?: boolean;
  snapshot?: string;
  recordFile?: string;
  serialLogPath?: string;
}

export interface DosboxLaunchConfig {
  type: 'dosbox';
  mode: 'interactive' | 'debug' | 'game' | 'capture';
  driveCPath: string;
  gameExe?: string;
  gameIso?: string;
  dosboxBin?: string;
  output?: string;
  configPath?: string;
  startDebugger?: boolean;
  debugRunFile?: string;
  logFile?: string;
  timeout?: number;
}

export type LaunchConfig = QemuLaunchConfig | DosboxLaunchConfig;
