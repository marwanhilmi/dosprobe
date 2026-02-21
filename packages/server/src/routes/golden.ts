import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import type { AppContext } from '../app.ts';
import type { CaptureRequest } from '@dosprobe/core';
import { compareWithGolden } from '@dosprobe/core';

export const goldenRoutes = new Hono<AppContext>();

goldenRoutes.post('/golden/generate', async (c) => {
  const backend = c.get('backend');
  if (!backend) return c.json({ error: 'No backend running' }, 503);

  const { goldenDir } = c.get('paths');
  const request = await c.req.json<CaptureRequest>();
  const prefix = request.prefix || 'golden';

  const result = await backend.capture(request);

  mkdirSync(goldenDir, { recursive: true });

  const written: string[] = [];

  if (result.framebuffer) {
    const path = join(goldenDir, `${prefix}_framebuffer.bin`);
    writeFileSync(path, result.framebuffer);
    written.push(`${prefix}_framebuffer.bin`);
  }

  if (result.screenshot) {
    const filename = `${prefix}_screenshot.${result.screenshotFormat}`;
    writeFileSync(join(goldenDir, filename), result.screenshot);
    written.push(filename);
  }

  if (result.registers) {
    const filename = `${prefix}_registers.json`;
    writeFileSync(join(goldenDir, filename), JSON.stringify(result.registers, null, 2));
    written.push(filename);
  }

  for (const [name, data] of result.memoryDumps) {
    writeFileSync(join(goldenDir, name), data);
    written.push(name);
  }

  // Write checksums manifest
  const checksums = Object.fromEntries(result.checksums);
  const checksumsFile = `${prefix}_checksums.json`;
  writeFileSync(join(goldenDir, checksumsFile), JSON.stringify(checksums, null, 2));
  written.push(checksumsFile);

  return c.json({
    prefix,
    goldenDir,
    files: written,
    checksums,
    timestamp: result.timestamp,
  });
});

goldenRoutes.post('/golden/compare', async (c) => {
  const backend = c.get('backend');
  if (!backend) return c.json({ error: 'No backend running' }, 503);

  const { goldenDir } = c.get('paths');
  const body = await c.req.json<CaptureRequest & { testName?: string }>();
  const testName = body.testName || body.prefix || 'golden';
  const request: CaptureRequest = { ...body, prefix: `_compare_${testName}` };

  const result = await backend.capture(request);

  const comparisons: Record<string, {
    match: boolean;
    goldenChecksum: string;
    actualChecksum: string;
    firstDiffOffset?: number;
    goldenByte?: number;
    actualByte?: number;
  }> = {};

  let allMatch = true;

  // Compare framebuffer
  if (result.framebuffer) {
    const goldenPath = join(goldenDir, `${testName}_framebuffer.bin`);
    const cmp = compareWithGolden(goldenPath, result.framebuffer);
    comparisons['framebuffer'] = cmp;
    if (!cmp.match) allMatch = false;
  }

  // Compare screenshot
  if (result.screenshot) {
    const goldenPath = join(goldenDir, `${testName}_screenshot.${result.screenshotFormat}`);
    if (existsSync(goldenPath)) {
      const cmp = compareWithGolden(goldenPath, result.screenshot);
      comparisons['screenshot'] = cmp;
      if (!cmp.match) allMatch = false;
    }
  }

  // Compare additional memory dumps
  for (const [name, data] of result.memoryDumps) {
    const goldenPath = join(goldenDir, name);
    const cmp = compareWithGolden(goldenPath, data);
    comparisons[name] = cmp;
    if (!cmp.match) allMatch = false;
  }

  return c.json({
    testName,
    match: allMatch,
    comparisons,
    timestamp: result.timestamp,
  });
});
