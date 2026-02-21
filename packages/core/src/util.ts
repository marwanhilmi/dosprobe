import { existsSync } from 'node:fs';

const DEFAULT_DOSBOX_PATH = '/opt/homebrew/bin/dosbox-x';
const DOSBOX_APP_CANDIDATES = [
  '/Applications/dosbox-x.app/Contents/MacOS/dosbox-x',
  '/Applications/DOSBox-X.app/Contents/MacOS/dosbox-x',
];

export function which(command: string): string | null {
  const paths = (process.env['PATH'] ?? '').split(':');
  for (const dir of paths) {
    const fullPath = `${dir}/${command}`;
    if (existsSync(fullPath)) return fullPath;
  }
  return null;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function resolveDosboxBinary(preferredPath?: string): string | null {
  const candidates = [
    preferredPath,
    process.env['DOSBOX_X_BIN'],
    ...DOSBOX_APP_CANDIDATES,
    which('dosbox-x'),
    which('dosbox'),
    DEFAULT_DOSBOX_PATH,
  ];

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function resolveDosboxOutput(preferredOutput?: string): string {
  const output = (preferredOutput ?? process.env['DOSBOX_X_OUTPUT'] ?? 'surface').trim().toLowerCase();
  return output.length > 0 ? output : 'surface';
}
