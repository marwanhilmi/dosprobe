import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { QemuBackend, DosboxBackend } from '@dosprobe/core';
import type { Backend, ProjectConfig } from '@dosprobe/core';

export interface ResolvedPaths {
  projectDir: string;
  dataDir: string;
  capturesDir: string;
  goldenDir: string;
  vmDir: string;
  sharedDir: string;
  isosDir: string;
  confDir: string;
  driveCPath: string;
  statesDir: string;
  qmpSocketPath: string;
  diskImage: string;
  sharedIso: string;
}

export function resolvePaths(projectDir: string, backendType: string): ResolvedPaths {
  const dataDir = join(projectDir, 'data', backendType === 'qemu' ? 'qemu' : 'dosbox');
  const vmDir = join(dataDir, 'vm');
  const sharedDir = join(dataDir, 'shared');
  const isosDir = join(dataDir, 'isos');
  const confDir = join(dataDir, 'conf');
  const driveCPath = join(dataDir, 'drive_c');
  const statesDir = join(dataDir, 'states');
  const capturesDir = join(dataDir, 'captures');
  const goldenDir = join(dataDir, 'golden');
  const qmpSocketPath = join(vmDir, 'qmp.sock');
  const diskImage = join(vmDir, 'dos_hdd.qcow2');
  const sharedIso = join(vmDir, 'shared.iso');

  return {
    projectDir,
    dataDir,
    capturesDir,
    goldenDir,
    vmDir,
    sharedDir,
    isosDir,
    confDir,
    driveCPath,
    statesDir,
    qmpSocketPath,
    diskImage,
    sharedIso,
  };
}

export function ensureDirs(paths: ResolvedPaths): void {
  for (const dir of [paths.capturesDir, paths.goldenDir, paths.vmDir, paths.confDir, paths.driveCPath, paths.statesDir, paths.sharedDir, paths.isosDir]) {
    mkdirSync(dir, { recursive: true });
  }
}

export function getProjectConfig(argv: Record<string, unknown>): ProjectConfig {
  return (argv['_config'] as ProjectConfig | undefined) ?? {};
}

export function resolveBackendType(argv: { backend?: string; project?: string }): 'qemu' | 'dosbox' {
  if (argv.backend) return argv.backend as 'qemu' | 'dosbox';

  // Check project config
  const config = getProjectConfig(argv as Record<string, unknown>);
  if (config.backend) return config.backend;

  // Auto-detect: if data/qemu/vm exists, prefer qemu; if data/dosbox/drive_c exists, prefer dosbox
  const projectDir = argv.project ?? process.cwd();
  if (existsSync(join(projectDir, 'data', 'qemu', 'vm'))) return 'qemu';
  if (existsSync(join(projectDir, 'data', 'dosbox', 'drive_c'))) return 'dosbox';

  // Default to qemu
  return 'qemu';
}

export async function connectToRunningQemu(paths: ResolvedPaths): Promise<Backend> {
  const backend = new QemuBackend(paths.capturesDir);
  await backend.connectToRunning(paths.qmpSocketPath);
  return backend;
}

export async function createDosboxBackend(paths: ResolvedPaths): Promise<Backend> {
  return new DosboxBackend({
    capturesDir: paths.capturesDir,
    confDir: paths.confDir,
    driveCPath: paths.driveCPath,
    statesDir: paths.statesDir,
  });
}

export async function resolveBackend(argv: { backend?: string; project?: string }): Promise<{ backend: Backend; type: 'qemu' | 'dosbox'; paths: ResolvedPaths }> {
  const type = resolveBackendType(argv);
  const projectDir = argv.project ?? process.cwd();
  const paths = resolvePaths(projectDir, type);

  let backend: Backend;
  if (type === 'qemu') {
    backend = await connectToRunningQemu(paths);
  } else {
    backend = await createDosboxBackend(paths);
  }

  return { backend, type, paths };
}

export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}
