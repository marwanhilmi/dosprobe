import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { Hono } from 'hono';
import type { AppContext } from '../app.ts';
import type { CaptureRequest } from '@dosprobe/core';

export const captureRoutes = new Hono<AppContext>();

captureRoutes.post('/captures', async (c) => {
  const backend = c.get('backend');
  if (!backend) return c.json({ error: 'No backend running' }, 503);

  const request = await c.req.json<CaptureRequest>();
  const result = await backend.capture(request);

  // Convert Maps to objects for JSON serialization
  const checksums = Object.fromEntries(result.checksums);
  const memoryDumps = Object.fromEntries(
    Array.from(result.memoryDumps.entries()).map(([k, v]) => [k, v.toString('base64')]),
  );

  return c.json({
    prefix: result.prefix,
    timestamp: result.timestamp,
    screenshotFormat: result.screenshotFormat,
    hasFramebuffer: !!result.framebuffer,
    hasScreenshot: !!result.screenshot,
    hasRegisters: !!result.registers,
    registers: result.registers,
    checksums,
    memoryDumps,
  });
});

captureRoutes.get('/captures', async (c) => {
  const { capturesDir } = c.get('paths');

  if (!existsSync(capturesDir)) {
    return c.json({ captures: [] });
  }

  const files = readdirSync(capturesDir);

  // Group files by prefix (everything before the last underscore + artifact type)
  const prefixMap = new Map<string, {
    prefix: string;
    timestamp: number;
    files: Array<{ name: string; size: number; type: string }>;
    checksums?: Record<string, string>;
  }>();

  for (const file of files) {
    const stat = statSync(join(capturesDir, file));
    if (!stat.isFile()) continue;

    // Extract prefix: e.g. "capture_framebuffer.bin" -> "capture"
    const match = file.match(/^(.+?)_(framebuffer\.bin|screenshot\.\w+|registers\.json|checksums\.json|.+)$/);
    const prefix = match ? match[1] : basename(file, file.substring(file.lastIndexOf('.')));

    if (!prefixMap.has(prefix)) {
      prefixMap.set(prefix, {
        prefix,
        timestamp: stat.mtimeMs,
        files: [],
      });
    }

    const entry = prefixMap.get(prefix)!;
    entry.timestamp = Math.max(entry.timestamp, stat.mtimeMs);

    const type = match?.[2]?.startsWith('framebuffer') ? 'framebuffer'
      : match?.[2]?.startsWith('screenshot') ? 'screenshot'
      : match?.[2]?.startsWith('registers') ? 'registers'
      : match?.[2]?.startsWith('checksums') ? 'checksums'
      : 'data';

    entry.files.push({ name: file, size: stat.size, type });

    // Load checksums if present
    if (type === 'checksums') {
      try {
        entry.checksums = JSON.parse(readFileSync(join(capturesDir, file), 'utf-8'));
      } catch {
        // ignore parse errors
      }
    }
  }

  const captures = Array.from(prefixMap.values())
    .sort((a, b) => b.timestamp - a.timestamp);

  return c.json({ captures });
});
