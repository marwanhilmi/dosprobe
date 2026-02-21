import type { BackendInfo, Breakpoint, BreakpointType, LaunchConfig, Registers } from '../types/api';

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...init?.headers as Record<string, string> };
  if (init?.body) {
    headers['Content-Type'] ??= 'application/json';
  }
  const res = await fetch(`/api${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, body);
  }
  return res.json() as Promise<T>;
}

async function apiFetchRaw(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`/api${path}`, init);
  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, body);
  }
  return res;
}

// ── Backend ──

export function getBackend(): Promise<BackendInfo> {
  return apiFetch('/backend');
}

export function selectBackend(backend: 'qemu' | 'dosbox'): Promise<{ ok: true; selected: string }> {
  return apiFetch('/backend/select', {
    method: 'POST',
    body: JSON.stringify({ backend }),
  });
}

// ── Launch ──

export function launch(config: LaunchConfig): Promise<{ ok: true; pid: number }> {
  return apiFetch('/launch', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

export function shutdown(): Promise<{ ok: true }> {
  return apiFetch('/launch', { method: 'DELETE' });
}

export interface LaunchDefaultsResponse {
  qemu: {
    diskImage: string;
    sharedIso: string;
    qmpSocketPath: string;
    capturesDir: string;
  };
  dosbox: {
    driveCPath: string;
    confDir: string;
    capturesDir: string;
  };
}

export function getLaunchDefaults(): Promise<LaunchDefaultsResponse> {
  return apiFetch('/launch/defaults');
}

// ── Registers ──

export function getRegisters(): Promise<Registers> {
  return apiFetch('/registers');
}

// ── Execution ──

export function pauseExecution(): Promise<{ ok: true; registers: Registers }> {
  return apiFetch('/execution/pause', { method: 'POST' });
}

export function resumeExecution(): Promise<{ ok: true }> {
  return apiFetch('/execution/resume', { method: 'POST' });
}

export function stepExecution(): Promise<{ registers: Registers }> {
  return apiFetch('/execution/step', { method: 'POST' });
}

// ── Breakpoints ──

export function getBreakpoints(): Promise<{ breakpoints: Breakpoint[] }> {
  return apiFetch('/breakpoints');
}

export function addBreakpoint(bp: {
  type: BreakpointType;
  address?: string;
  interrupt?: number;
  ah?: number;
}): Promise<Breakpoint> {
  return apiFetch('/breakpoints', {
    method: 'POST',
    body: JSON.stringify(bp),
  });
}

export function removeBreakpoint(id: string): Promise<{ ok: true }> {
  return apiFetch(`/breakpoints/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ── Memory ──

export function readMemory(address: string, size: number): Promise<{ address: string; size: number; data: string; sha256: string }> {
  return apiFetch(`/memory/${encodeURIComponent(address)}/${size}`);
}

export function readMemoryRaw(address: string, size: number): Promise<ArrayBuffer> {
  return apiFetchRaw(`/memory/${encodeURIComponent(address)}/${size}?format=raw`).then(r => r.arrayBuffer());
}

// ── Screenshot ──

export function getScreenshot(): Promise<{ blob: Blob; contentType: string }> {
  return apiFetchRaw('/screenshot').then(async (r) => ({
    blob: await r.blob(),
    contentType: r.headers.get('content-type') ?? 'image/x-portable-pixmap',
  }));
}

// ── Keys ──

export function sendKeys(keys: string[], delay?: number): Promise<{ ok: true; injected: number }> {
  return apiFetch('/keys', {
    method: 'POST',
    body: JSON.stringify({ keys, delay }),
  });
}

export { ApiError };
