import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface ProjectConfig {
  backend?: 'qemu' | 'dosbox';
  game?: { exe?: string; iso?: string };
  qemu?: {
    ram?: number;
    display?: 'cocoa' | 'none';
    audio?: boolean;
    gdbPort?: number;
    accel?: string;
    cpu?: string;
    smp?: number;
  };
  dosbox?: { binary?: string; renderer?: string; memory?: number; machine?: string; cpuCycles?: string };
  capture?: { timeout?: number; waitTime?: number; keyDelay?: number };
  server?: { port?: number };
}

export const CONFIG_FILENAME = 'dosprobe.json';

export function loadProjectConfig(projectDir: string): ProjectConfig {
  const filePath = join(projectDir, CONFIG_FILENAME);
  if (!existsSync(filePath)) return {};

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch (err) {
    throw new Error(`Failed to parse ${filePath}: ${err instanceof Error ? err.message : err}`);
  }

  return validateConfig(raw, filePath);
}

export function validateConfig(raw: unknown, filePath: string): ProjectConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`${filePath}: config must be a JSON object`);
  }

  const obj = raw as Record<string, unknown>;
  const config: ProjectConfig = {};

  const knownKeys = new Set(['backend', 'game', 'qemu', 'dosbox', 'capture', 'server']);
  for (const key of Object.keys(obj)) {
    if (!knownKeys.has(key)) {
      console.warn(`Warning: unknown key "${key}" in ${filePath}`);
    }
  }

  // backend
  if (obj['backend'] !== undefined) {
    if (obj['backend'] !== 'qemu' && obj['backend'] !== 'dosbox') {
      throw new Error(`${filePath}: "backend" must be "qemu" or "dosbox", got "${obj['backend']}"`);
    }
    config.backend = obj['backend'];
  }

  // game
  if (obj['game'] !== undefined) {
    if (typeof obj['game'] !== 'object' || obj['game'] === null || Array.isArray(obj['game'])) {
      throw new Error(`${filePath}: "game" must be an object`);
    }
    const game = obj['game'] as Record<string, unknown>;
    config.game = {};
    if (game['exe'] !== undefined) {
      if (typeof game['exe'] !== 'string') throw new Error(`${filePath}: "game.exe" must be a string`);
      config.game.exe = game['exe'];
    }
    if (game['iso'] !== undefined) {
      if (typeof game['iso'] !== 'string') throw new Error(`${filePath}: "game.iso" must be a string`);
      config.game.iso = game['iso'];
    }
  }

  // qemu
  if (obj['qemu'] !== undefined) {
    if (typeof obj['qemu'] !== 'object' || obj['qemu'] === null || Array.isArray(obj['qemu'])) {
      throw new Error(`${filePath}: "qemu" must be an object`);
    }
    const qemu = obj['qemu'] as Record<string, unknown>;
    config.qemu = {};
    if (qemu['ram'] !== undefined) {
      if (typeof qemu['ram'] !== 'number' || qemu['ram'] <= 0) throw new Error(`${filePath}: "qemu.ram" must be a positive number`);
      config.qemu.ram = qemu['ram'];
    }
    if (qemu['display'] !== undefined) {
      if (qemu['display'] !== 'cocoa' && qemu['display'] !== 'none') throw new Error(`${filePath}: "qemu.display" must be "cocoa" or "none"`);
      config.qemu.display = qemu['display'];
    }
    if (qemu['audio'] !== undefined) {
      if (typeof qemu['audio'] !== 'boolean') throw new Error(`${filePath}: "qemu.audio" must be a boolean`);
      config.qemu.audio = qemu['audio'];
    }
    if (qemu['gdbPort'] !== undefined) {
      if (typeof qemu['gdbPort'] !== 'number' || qemu['gdbPort'] <= 0) throw new Error(`${filePath}: "qemu.gdbPort" must be a positive number`);
      config.qemu.gdbPort = qemu['gdbPort'];
    }
    if (qemu['accel'] !== undefined) {
      if (typeof qemu['accel'] !== 'string' || qemu['accel'].trim().length === 0) throw new Error(`${filePath}: "qemu.accel" must be a non-empty string`);
      config.qemu.accel = qemu['accel'];
    }
    if (qemu['cpu'] !== undefined) {
      if (typeof qemu['cpu'] !== 'string' || qemu['cpu'].trim().length === 0) throw new Error(`${filePath}: "qemu.cpu" must be a non-empty string`);
      config.qemu.cpu = qemu['cpu'];
    }
    if (qemu['smp'] !== undefined) {
      if (typeof qemu['smp'] !== 'number' || qemu['smp'] <= 0 || !Number.isFinite(qemu['smp'])) throw new Error(`${filePath}: "qemu.smp" must be a positive number`);
      config.qemu.smp = Math.floor(qemu['smp']);
    }
  }

  // dosbox
  if (obj['dosbox'] !== undefined) {
    if (typeof obj['dosbox'] !== 'object' || obj['dosbox'] === null || Array.isArray(obj['dosbox'])) {
      throw new Error(`${filePath}: "dosbox" must be an object`);
    }
    const dosbox = obj['dosbox'] as Record<string, unknown>;
    config.dosbox = {};
    if (dosbox['binary'] !== undefined) {
      if (typeof dosbox['binary'] !== 'string') throw new Error(`${filePath}: "dosbox.binary" must be a string`);
      config.dosbox.binary = dosbox['binary'];
    }
    if (dosbox['renderer'] !== undefined) {
      if (typeof dosbox['renderer'] !== 'string') throw new Error(`${filePath}: "dosbox.renderer" must be a string`);
      config.dosbox.renderer = dosbox['renderer'];
    }
    if (dosbox['memory'] !== undefined) {
      if (typeof dosbox['memory'] !== 'number' || dosbox['memory'] <= 0) throw new Error(`${filePath}: "dosbox.memory" must be a positive number`);
      config.dosbox.memory = dosbox['memory'];
    }
    if (dosbox['machine'] !== undefined) {
      if (typeof dosbox['machine'] !== 'string') throw new Error(`${filePath}: "dosbox.machine" must be a string`);
      config.dosbox.machine = dosbox['machine'];
    }
    if (dosbox['cpuCycles'] !== undefined) {
      if (typeof dosbox['cpuCycles'] !== 'string') throw new Error(`${filePath}: "dosbox.cpuCycles" must be a string`);
      config.dosbox.cpuCycles = dosbox['cpuCycles'];
    }
  }

  // capture
  if (obj['capture'] !== undefined) {
    if (typeof obj['capture'] !== 'object' || obj['capture'] === null || Array.isArray(obj['capture'])) {
      throw new Error(`${filePath}: "capture" must be an object`);
    }
    const capture = obj['capture'] as Record<string, unknown>;
    config.capture = {};
    if (capture['timeout'] !== undefined) {
      if (typeof capture['timeout'] !== 'number' || capture['timeout'] <= 0) throw new Error(`${filePath}: "capture.timeout" must be a positive number`);
      config.capture.timeout = capture['timeout'];
    }
    if (capture['waitTime'] !== undefined) {
      if (typeof capture['waitTime'] !== 'number' || capture['waitTime'] < 0) throw new Error(`${filePath}: "capture.waitTime" must be a non-negative number`);
      config.capture.waitTime = capture['waitTime'];
    }
    if (capture['keyDelay'] !== undefined) {
      if (typeof capture['keyDelay'] !== 'number' || capture['keyDelay'] < 0) throw new Error(`${filePath}: "capture.keyDelay" must be a non-negative number`);
      config.capture.keyDelay = capture['keyDelay'];
    }
  }

  // server
  if (obj['server'] !== undefined) {
    if (typeof obj['server'] !== 'object' || obj['server'] === null || Array.isArray(obj['server'])) {
      throw new Error(`${filePath}: "server" must be an object`);
    }
    const server = obj['server'] as Record<string, unknown>;
    config.server = {};
    if (server['port'] !== undefined) {
      if (typeof server['port'] !== 'number' || server['port'] <= 0) throw new Error(`${filePath}: "server.port" must be a positive number`);
      config.server.port = server['port'];
    }
  }

  return config;
}

export function writeProjectConfig(projectDir: string, config: ProjectConfig): void {
  const filePath = join(projectDir, CONFIG_FILENAME);
  writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n');
}
