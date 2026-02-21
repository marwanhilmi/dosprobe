// Types
export type {
  SegOff,
  DosAddress,
  Registers,
  BreakpointType,
  Breakpoint,
  CaptureRequest,
  CaptureResult,
  Snapshot,
  BackendStatus,
  BackendInfo,
  QemuLaunchConfig,
  DosboxLaunchConfig,
  LaunchConfig,
} from './types.ts';

// Address utilities
export {
  segOffToLinear,
  linearToSegOff,
  parseAddress,
  formatSegOff,
} from './address.ts';

// Abstract backend
export { Backend } from './backend.ts';

// QEMU
export { QmpClient } from './qemu/qmp-client.ts';
export { GdbClient } from './qemu/gdb-client.ts';
export { QemuLauncher } from './qemu/qemu-launcher.ts';
export { QemuBackend } from './qemu/qemu-backend.ts';

// DOSBox-X
export { DosboxConfig } from './dosbox/config-generator.ts';
export { DebugScript } from './dosbox/debug-script.ts';
export { parseRegisters, parseLastRegisters } from './dosbox/debug-log-parser.ts';
export { DosboxSession } from './dosbox/session-manager.ts';
export { StateManager } from './dosbox/state-manager.ts';
export { DosboxBackend } from './dosbox/dosbox-backend.ts';
export type { StateInfo } from './dosbox/state-manager.ts';

// Capture pipeline
export { CapturePipeline } from './capture/capture-pipeline.ts';
export { compareWithGolden } from './capture/golden-file.ts';
export type { GoldenComparison } from './capture/golden-file.ts';
export {
  MODE_13H_ADDRESS,
  MODE_13H_SIZE,
  MODE_13H_WIDTH,
  MODE_13H_HEIGHT,
  MODE_13H_SEG,
  MODE_13H_OFF,
} from './capture/framebuffer.ts';

// Config
export type { ProjectConfig } from './config/index.ts';
export {
  CONFIG_FILENAME,
  loadProjectConfig,
  validateConfig,
  writeProjectConfig,
} from './config/index.ts';

// Utilities
export { which, sleep, resolveDosboxBinary, resolveDosboxOutput } from './util.ts';
