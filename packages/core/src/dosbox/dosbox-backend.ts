import { join, dirname } from 'node:path';
import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
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
  DosboxLaunchConfig,
} from '../types.ts';
import { DosboxConfig } from './config-generator.ts';
import { DebugScript } from './debug-script.ts';
import { parseLastRegisters } from './debug-log-parser.ts';
import { DosboxSession } from './session-manager.ts';
import { StateManager } from './state-manager.ts';
import { MODE_13H_SEG, MODE_13H_OFF, MODE_13H_SIZE } from '../capture/framebuffer.ts';
import { resolveDosboxBinary, resolveDosboxOutput } from '../util.ts';
import { sha256 } from '@dosprobe/shared';

export class DosboxBackend extends Backend {
  readonly type = 'dosbox' as const;
  private currentStatus: BackendStatus = 'disconnected';
  private session: DosboxSession | null = null;
  private stateManager: StateManager;
  readonly capturesDir: string;
  readonly confDir: string;
  readonly driveCPath: string;
  private readonly dosboxBin?: string;
  private readonly dosboxOutput: string;
  private readonly interactiveLogPath: string;
  private readonly workingDir: string;

  constructor(opts: {
    capturesDir: string;
    confDir: string;
    driveCPath: string;
    statesDir: string;
    dosboxBin?: string;
    dosboxOutput?: string;
  }) {
    super();
    this.capturesDir = opts.capturesDir;
    this.confDir = opts.confDir;
    this.driveCPath = opts.driveCPath;
    this.dosboxBin = resolveDosboxBinary(opts.dosboxBin) ?? undefined;
    this.dosboxOutput = resolveDosboxOutput(opts.dosboxOutput);
    this.interactiveLogPath = join(opts.capturesDir, 'dosbox-x.log');
    this.workingDir = dirname(opts.confDir);
    this.stateManager = new StateManager(opts.statesDir);
    mkdirSync(opts.capturesDir, { recursive: true });
    mkdirSync(opts.confDir, { recursive: true });
  }

  status(): BackendInfo {
    return {
      type: 'dosbox',
      status: this.currentStatus,
      pid: this.session?.getPid(),
    };
  }

  async launch(config: LaunchConfig): Promise<void> {
    if (config.type !== 'dosbox') throw new Error('Expected DOSBox launch config');
    const dosConfig = config as DosboxLaunchConfig;

    this.currentStatus = 'launching';

    const conf = new DosboxConfig(dosConfig.configPath);
    const selectedOutput = this.applyVideoSettings(conf, dosConfig.output);
    const logPath = dosConfig.logFile ?? this.interactiveLogPath;
    rmSync(logPath, { force: true });
    conf.set('log', 'logfile', logPath);

    const autoexec: string[] = [`MOUNT C "${this.driveCPath}"`, 'C:'];

    if (dosConfig.gameIso) {
      autoexec.push(`IMGMOUNT D "${dosConfig.gameIso}" -t cdrom`);
    }
    if (dosConfig.gameExe) {
      autoexec.push('CD \\GAME');
      autoexec.push(dosConfig.gameExe);
    }
    conf.setAutoexec(autoexec);

    const confPath = join(this.confDir, '_session.conf');
    conf.write(confPath);

    const extraArgs: string[] = ['-set', `sdl output=${selectedOutput}`];
    if (dosConfig.startDebugger || dosConfig.mode === 'debug') {
      extraArgs.push('-startdebugger');
    }

    this.session = new DosboxSession(confPath, this.workingDir);
    const result = this.session.launch({
      extraArgs,
      wait: dosConfig.mode === 'capture',
      timeout: dosConfig.timeout ?? 60,
      dosboxBin: dosConfig.dosboxBin ?? this.dosboxBin,
      env: this.resolveDosboxEnv(selectedOutput),
    });

    this.currentStatus = 'running';
    this.emit('status', this.currentStatus);

    if (dosConfig.mode === 'capture') {
      await result;
      this.currentStatus = 'disconnected';
    }
  }

  disconnect(): void {
    this.session = null;
    this.currentStatus = 'disconnected';
    this.emit('status', this.currentStatus);
  }

  async shutdown(): Promise<void> {
    this.session?.kill();
    this.disconnect();
  }

  async readMemory(address: DosAddress, size: number): Promise<Buffer> {
    const { segment, offset } = address.segOff;
    const filename = `_mem_${Date.now()}.bin`;
    const outPath = join(this.capturesDir, filename);
    const logPath = join(this.capturesDir, '_mem_read.log');
    rmSync(logPath, { force: true });

    const dbg = new DebugScript();
    dbg.continueExec();
    dbg.memdumpBin(segment, offset, size, outPath);
    const dbgPath = join(this.capturesDir, '_mem_read.cmd');
    dbg.write(dbgPath);

    const conf = new DosboxConfig();
    const output = this.applyVideoSettings(conf);
    conf.set('log', 'logfile', logPath);
    conf.set('debugger', 'debugrunfile', dbgPath);
    conf.setAutoexec([`MOUNT C "${this.driveCPath}"`, 'C:']);
    const confPath = join(this.confDir, '_mem_read.conf');
    conf.write(confPath);

    const session = new DosboxSession(confPath, this.workingDir);
    await session.launch({
      extraArgs: ['-startdebugger'],
      timeout: 30,
      dosboxBin: this.dosboxBin,
      env: this.resolveDosboxEnv(output),
    });

    if (existsSync(outPath)) {
      return readFileSync(outPath);
    }
    throw new Error(`Memory dump failed. Check ${logPath}`);
  }

  async writeMemory(_address: DosAddress, _data: Buffer): Promise<void> {
    throw new Error('DOSBox-X does not support live memory writes from host');
  }

  async readRegisters(): Promise<Registers> {
    const logPath = join(this.capturesDir, '_regs.log');
    rmSync(logPath, { force: true });

    const dbg = new DebugScript();
    dbg.continueExec();
    dbg.showRegisters();
    const dbgPath = join(this.capturesDir, '_regs.cmd');
    dbg.write(dbgPath);

    const conf = new DosboxConfig();
    const output = this.applyVideoSettings(conf);
    conf.set('log', 'logfile', logPath);
    conf.set('debugger', 'debugrunfile', dbgPath);
    conf.setAutoexec([`MOUNT C "${this.driveCPath}"`, 'C:']);
    const confPath = join(this.confDir, '_regs.conf');
    conf.write(confPath);

    const session = new DosboxSession(confPath, this.workingDir);
    await session.launch({
      extraArgs: ['-startdebugger'],
      timeout: 30,
      dosboxBin: this.dosboxBin,
      env: this.resolveDosboxEnv(output),
    });

    const regs = parseLastRegisters(logPath);
    return regs as Registers;
  }

  async sendKeys(keys: string[], delay = 3.0): Promise<void> {
    const conf = new DosboxConfig();
    const output = this.applyVideoSettings(conf);
    const autoexec = [
      `MOUNT C "${this.driveCPath}"`,
      'C:',
      `AUTOTYPE -w ${delay.toFixed(1)} -p 0.15 ${keys.join(' ')}`,
    ];
    conf.setAutoexec(autoexec);
    const confPath = join(this.confDir, '_keys.conf');
    conf.write(confPath);

    const session = new DosboxSession(confPath, this.workingDir);
    await session.launch({
      timeout: 30,
      dosboxBin: this.dosboxBin,
      env: this.resolveDosboxEnv(output),
    });
  }

  async screenshot(): Promise<{ data: Buffer; format: string }> {
    throw new Error('Screenshots require interactive DOSBox-X session (Ctrl+F5)');
  }

  async setBreakpoint(_type: BreakpointType, _address: DosAddress): Promise<Breakpoint> {
    throw new Error('Breakpoints in DOSBox-X are set via debug scripts, not live');
  }

  async removeBreakpoint(_id: string): Promise<void> {
    // No-op for DOSBox-X
  }

  async listBreakpoints(): Promise<Breakpoint[]> {
    return [];
  }

  async pause(): Promise<void> {
    // DOSBox-X session model doesn't support live pause from host
  }

  async resume(): Promise<void> {
    // DOSBox-X session model doesn't support live resume from host
  }

  async step(): Promise<Registers> {
    throw new Error('Stepping in DOSBox-X requires a debug session');
  }

  async saveSnapshot(_name: string): Promise<Snapshot> {
    throw new Error('Save states in DOSBox-X are created interactively');
  }

  async loadSnapshot(_name: string): Promise<void> {
    throw new Error('Save states in DOSBox-X are loaded interactively');
  }

  async listSnapshots(): Promise<Snapshot[]> {
    return this.stateManager.listStates().map((s) => ({
      name: s.name,
      backend: 'dosbox' as const,
      size: s.size,
      modified: s.modified,
      filePath: s.file,
    }));
  }

  async capture(request: CaptureRequest): Promise<CaptureResult> {
    const result: CaptureResult = {
      prefix: request.prefix,
      screenshotFormat: 'bmp',
      memoryDumps: new Map(),
      checksums: new Map(),
      timestamp: Date.now(),
    };

    const fbPath = join(this.capturesDir, `${request.prefix}_framebuffer.bin`);
    const logPath = join(this.capturesDir, `${request.prefix}_debug.log`);
    rmSync(logPath, { force: true });

    const dbg = new DebugScript();
    if (request.breakpoint) {
      const { segment, offset } = request.breakpoint.segOff;
      dbg.breakpoint(segment, offset);
    }
    dbg.continueExec();

    if (request.captureFramebuffer !== false) {
      dbg.memdumpBin(MODE_13H_SEG, MODE_13H_OFF, MODE_13H_SIZE, fbPath);
    }
    dbg.showRegisters();

    const dbgPath = join(this.capturesDir, `${request.prefix}_debug.cmd`);
    dbg.write(dbgPath);

    const conf = new DosboxConfig();
    const output = this.applyVideoSettings(conf);
    conf.set('log', 'logfile', logPath);
    conf.set('debugger', 'debugrunfile', dbgPath);

    const autoexec = [`MOUNT C "${this.driveCPath}"`, 'C:'];
    if (request.keys && request.keys.length > 0) {
      const wait = request.waitTime ?? 3.0;
      autoexec.push(`AUTOTYPE -w ${wait.toFixed(1)} -p 0.15 ${request.keys.join(' ')}`);
    }
    autoexec.push('CD \\GAME');
    conf.setAutoexec(autoexec);

    const confPath = join(this.confDir, `_${request.prefix}_session.conf`);
    conf.write(confPath);

    const session = new DosboxSession(confPath, this.workingDir);
    await session.launch({
      extraArgs: ['-startdebugger'],
      timeout: request.timeout ?? 45,
      dosboxBin: this.dosboxBin,
      env: this.resolveDosboxEnv(output),
    });

    if (existsSync(fbPath)) {
      result.framebuffer = readFileSync(fbPath);
      result.checksums.set('framebuffer', sha256(result.framebuffer));
    }

    if (request.captureRegisters !== false) {
      const regs = parseLastRegisters(logPath);
      result.registers = regs as Registers;
      const regPath = join(this.capturesDir, `${request.prefix}_registers.json`);
      writeFileSync(regPath, JSON.stringify(regs, null, 2));
    }

    return result;
  }

  getStateManager(): StateManager {
    return this.stateManager;
  }

  private applyVideoSettings(conf: DosboxConfig, preferredOutput?: string): string {
    const output = resolveDosboxOutput(preferredOutput ?? this.dosboxOutput);
    conf.set('sdl', 'output', output);
    if (output === 'surface') {
      conf.set('sdl', 'windowresolution', 'original');
    }
    return output;
  }

  private resolveDosboxEnv(output: string): NodeJS.ProcessEnv | undefined {
    if (output !== 'surface') {
      return undefined;
    }
    if (process.env['SDL_RENDER_DRIVER']) {
      return undefined;
    }
    return { SDL_RENDER_DRIVER: 'software' };
  }
}
