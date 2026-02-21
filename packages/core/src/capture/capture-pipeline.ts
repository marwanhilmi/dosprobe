import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { sha256 } from '@dosprobe/shared';
import type { CaptureRequest, CaptureResult, Registers } from '../types.ts';
import type { Backend } from '../backend.ts';
import { parseAddress } from '../address.ts';
import { MODE_13H_ADDRESS, MODE_13H_SIZE } from './framebuffer.ts';
import { sleep } from '../util.ts';

interface QemuLikeBackend extends Backend {
  getGdb(): { waitForStop(timeoutMs?: number): Promise<string> } | null;
}

function isQemuLikeBackend(backend: Backend): backend is QemuLikeBackend {
  return typeof (backend as Partial<QemuLikeBackend>).getGdb === 'function';
}

export class CapturePipeline {
  private readonly backend: Backend;
  private readonly capturesDir: string;

  constructor(backend: Backend, capturesDir: string) {
    this.backend = backend;
    this.capturesDir = capturesDir;
    mkdirSync(capturesDir, { recursive: true });
  }

  async run(request: CaptureRequest): Promise<CaptureResult> {
    const result: CaptureResult = {
      prefix: request.prefix,
      screenshotFormat: this.backend.type === 'qemu' ? 'ppm' : 'bmp',
      memoryDumps: new Map(),
      checksums: new Map(),
      timestamp: Date.now(),
    };

    // Load snapshot if specified
    if (request.snapshot) {
      await this.backend.loadSnapshot(request.snapshot);
      await sleep(1000); // let VM settle
    }

    // Inject keys if specified
    if (request.keys && request.keys.length > 0) {
      await this.backend.sendKeys(request.keys, request.keyDelay);
      await sleep((request.waitTime ?? 2) * 1000);
    }

    // Set breakpoint and wait if specified
    if (request.breakpoint) {
      const bp = await this.backend.setBreakpoint(
        'execution',
        request.breakpoint,
      );
      await this.backend.resume();
      if (isQemuLikeBackend(this.backend)) {
        const gdb = this.backend.getGdb();
        if (!gdb) {
          throw new Error('QEMU GDB connection is not available for breakpoint capture');
        }
        await gdb.waitForStop((request.timeout ?? 30) * 1000);
      } else {
        // Fallback for backends without a live stop event stream.
        await sleep((request.timeout ?? 30) * 1000);
      }
      await this.backend.removeBreakpoint(bp.id);
    } else {
      // Pause for consistent capture
      await this.backend.pause();
    }

    // Capture framebuffer
    if (request.captureFramebuffer !== false) {
      const addr = parseAddress(`0x${MODE_13H_ADDRESS.toString(16)}`);
      result.framebuffer = await this.backend.readMemory(addr, MODE_13H_SIZE);
      const fbPath = join(this.capturesDir, `${request.prefix}_framebuffer.bin`);
      writeFileSync(fbPath, result.framebuffer);
      result.checksums.set('framebuffer', sha256(result.framebuffer));
    }

    // Capture screenshot
    if (request.captureScreenshot !== false) {
      const ss = await this.backend.screenshot();
      result.screenshot = ss.data;
      result.screenshotFormat = ss.format as 'ppm' | 'bmp' | 'png';
      const ext = ss.format;
      const ssPath = join(this.capturesDir, `${request.prefix}_screenshot.${ext}`);
      writeFileSync(ssPath, result.screenshot);
      result.checksums.set('screenshot', sha256(result.screenshot));
    }

    // Capture registers
    if (request.captureRegisters !== false) {
      result.registers = await this.backend.readRegisters();
      const regPath = join(this.capturesDir, `${request.prefix}_registers.json`);
      writeFileSync(regPath, JSON.stringify(result.registers, null, 2));
    }

    // Capture additional memory ranges
    if (request.memoryRanges) {
      for (const range of request.memoryRanges) {
        const data = await this.backend.readMemory(range.address, range.size);
        result.memoryDumps.set(range.filename, data);
        const memPath = join(this.capturesDir, range.filename);
        writeFileSync(memPath, data);
        result.checksums.set(range.filename, sha256(data));
      }
    }

    // Resume execution
    await this.backend.resume();

    return result;
  }
}
