import { execFileSync } from 'node:child_process';
import type { CommandModule } from 'yargs';
import { QemuBackend, parseAddress, which } from '@dosprobe/core';
import { ensureDirs, resolveBackendType, resolvePaths } from '../resolve-backend.ts';

interface BenchmarkResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  opsPerSec: number;
  totalBytes?: number;
  throughputMiBps?: number;
}

interface PerfReport {
  timestamp: number;
  host: {
    qemuBinary: string | null;
    qemuVersion?: string;
    accelerators?: string[];
    accelProbeError?: string;
  };
  vm: {
    connected: boolean;
    qmpSocketPath: string;
    status?: unknown;
    infoAccel?: string;
    infoBlock?: string;
    error?: string;
  };
  benchmarks: BenchmarkResult[];
  findings: string[];
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo] ?? 0;
  const loVal = sorted[lo] ?? 0;
  const hiVal = sorted[hi] ?? 0;
  return loVal + (hiVal - loVal) * (idx - lo);
}

function summarize(samples: number[]): Omit<BenchmarkResult, 'name' | 'iterations' | 'totalBytes' | 'throughputMiBps'> {
  const sorted = [...samples].sort((a, b) => a - b);
  const totalMs = samples.reduce((acc, n) => acc + n, 0);
  const iterations = samples.length || 1;
  const avgMs = totalMs / iterations;
  const minMs = sorted[0] ?? 0;
  const maxMs = sorted[sorted.length - 1] ?? 0;
  const p50Ms = percentile(sorted, 0.5);
  const p95Ms = percentile(sorted, 0.95);
  const opsPerSec = totalMs > 0 ? (samples.length * 1000) / totalMs : 0;
  return { totalMs, avgMs, minMs, p50Ms, p95Ms, maxMs, opsPerSec };
}

async function benchmark(
  name: string,
  iterations: number,
  operation: () => Promise<number>,
): Promise<BenchmarkResult> {
  const samples: number[] = [];
  let totalBytes = 0;

  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    const bytes = await operation();
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    samples.push(elapsedMs);
    totalBytes += bytes;
  }

  const stats = summarize(samples);
  const result: BenchmarkResult = {
    name,
    iterations,
    ...stats,
  };

  if (totalBytes > 0) {
    result.totalBytes = totalBytes;
    result.throughputMiBps = stats.totalMs > 0
      ? (totalBytes / (1024 * 1024)) / (stats.totalMs / 1000)
      : 0;
  }

  return result;
}

function tryExec(file: string, args: string[]): { output?: string; error?: string } {
  try {
    const output = execFileSync(file, args, { encoding: 'utf-8' }).trim();
    return { output };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
  }
}

function parseAccelerators(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('Accelerators supported'));
}

function formatMs(ms: number): string {
  return `${ms.toFixed(2)} ms`;
}

function formatOps(opsPerSec: number): string {
  return `${opsPerSec.toFixed(2)} ops/s`;
}

export const perfCommand: CommandModule = {
  command: 'perf',
  describe: 'Diagnose QEMU performance characteristics',
  builder: (yargs) =>
    yargs
      .option('iterations', {
        describe: 'Iterations for register/memory microbenchmarks',
        type: 'number',
        default: 20,
      })
      .option('memory-address', {
        describe: 'Address to benchmark memory reads from',
        type: 'string',
        default: '0xA0000',
      })
      .option('memory-size', {
        describe: 'Bytes per memory read benchmark iteration',
        type: 'number',
        default: 64000,
      })
      .option('include-screenshot', {
        describe: 'Include screenshot benchmark (heavier)',
        type: 'boolean',
        default: false,
      })
      .option('screenshot-iterations', {
        describe: 'Iterations for screenshot benchmark',
        type: 'number',
        default: 3,
      })
      .option('pause', {
        describe: 'Pause VM while running microbenchmarks',
        type: 'boolean',
        default: true,
      })
      .option('skip-bench', {
        describe: 'Skip backend microbenchmarks and only report static diagnostics',
        type: 'boolean',
        default: false,
      }),
  handler: async (argv) => {
    const backendType = resolveBackendType(argv as { backend?: string; project?: string });
    if (backendType !== 'qemu') {
      console.error('dosprobe perf currently supports only the QEMU backend.');
      process.exitCode = 1;
      return;
    }

    const projectDir = (argv['project'] as string | undefined) ?? process.cwd();
    const paths = resolvePaths(projectDir, 'qemu');
    ensureDirs(paths);

    const qemuBinary = which('qemu-system-i386');
    const qemuExec = qemuBinary ?? 'qemu-system-i386';

    const versionProbe = tryExec(qemuExec, ['--version']);
    const accelProbe = tryExec(qemuExec, ['-accel', 'help']);
    const accelerators = accelProbe.output ? parseAccelerators(accelProbe.output) : [];

    const report: PerfReport = {
      timestamp: Date.now(),
      host: {
        qemuBinary,
        qemuVersion: versionProbe.output?.split('\n')[0],
        accelerators,
        accelProbeError: accelProbe.error,
      },
      vm: {
        connected: false,
        qmpSocketPath: paths.qmpSocketPath,
      },
      benchmarks: [],
      findings: [],
    };

    const backend = new QemuBackend(paths.capturesDir);
    let paused = false;

    try {
      await backend.connectToRunning(paths.qmpSocketPath);
      report.vm.connected = true;

      const qmp = backend.getQmp();
      if (qmp) {
        try {
          const status = await qmp.execute('query-status');
          report.vm.status = status['return'];
        } catch {
          // non-fatal
        }

        try {
          const infoAccel = await qmp.execute('human-monitor-command', {
            'command-line': 'info accel',
          });
          const raw = infoAccel['return'];
          if (typeof raw === 'string') report.vm.infoAccel = raw.trim();
        } catch {
          // non-fatal
        }

        try {
          const infoBlock = await qmp.execute('human-monitor-command', {
            'command-line': 'info block',
          });
          const raw = infoBlock['return'];
          if (typeof raw === 'string') report.vm.infoBlock = raw.trim();
        } catch {
          // non-fatal
        }
      }

      if (!(argv['skip-bench'] as boolean)) {
        const iterations = Math.max(1, Math.floor(argv['iterations'] as number));
        const memorySize = Math.max(1, Math.floor(argv['memory-size'] as number));
        const memoryAddress = parseAddress(argv['memory-address'] as string);
        const includeScreenshot = argv['include-screenshot'] as boolean;
        const screenshotIterations = Math.max(1, Math.floor(argv['screenshot-iterations'] as number));
        const shouldPause = argv['pause'] as boolean;

        if (shouldPause) {
          await backend.pause();
          paused = true;
        }

        report.benchmarks.push(await benchmark('readRegisters', iterations, async () => {
          await backend.readRegisters();
          return 0;
        }));

        report.benchmarks.push(await benchmark(`readMemory ${argv['memory-address']} (${memorySize} bytes)`, iterations, async () => {
          const buffer = await backend.readMemory(memoryAddress, memorySize);
          return buffer.length;
        }));

        if (includeScreenshot) {
          report.benchmarks.push(await benchmark('screenshot', screenshotIterations, async () => {
            const screenshot = await backend.screenshot();
            return screenshot.data.length;
          }));
        }
      }
    } catch (err) {
      report.vm.error = err instanceof Error ? err.message : String(err);
    } finally {
      if (paused) {
        try {
          await backend.resume();
        } catch {
          // best effort
        }
      }
      backend.disconnect();
    }

    if (report.host.accelerators?.length === 1 && report.host.accelerators[0] === 'tcg') {
      report.findings.push('QEMU supports only TCG software emulation on this host; gameplay will be significantly slower than hardware-accelerated virtualization.');
    }
    if (!report.vm.connected) {
      report.findings.push('Could not connect to a running QEMU instance via QMP/GDB; runtime microbenchmarks were skipped.');
    }
    if (report.benchmarks.length > 0) {
      const memoryBench = report.benchmarks.find((b) => b.name.startsWith('readMemory '));
      if (memoryBench && memoryBench.p95Ms > 100) {
        report.findings.push(`Memory read p95 is high (${memoryBench.p95Ms.toFixed(2)} ms), which can make memory-watch and capture operations feel sluggish.`);
      }
    }

    const asJson = (argv as Record<string, unknown>)['json'] as boolean | undefined;
    if (asJson) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    console.log('QEMU Performance Diagnostics');
    console.log(`  Time: ${new Date(report.timestamp).toISOString()}`);
    console.log(`  QEMU binary: ${report.host.qemuBinary ?? '(not found in PATH)'}`);
    if (report.host.qemuVersion) {
      console.log(`  QEMU version: ${report.host.qemuVersion}`);
    }
    if (report.host.accelerators && report.host.accelerators.length > 0) {
      console.log(`  Supported accelerators: ${report.host.accelerators.join(', ')}`);
    }
    if (report.host.accelProbeError) {
      console.log(`  Accelerator probe error: ${report.host.accelProbeError}`);
    }

    console.log(`  QMP socket: ${report.vm.qmpSocketPath}`);
    console.log(`  VM connected: ${report.vm.connected ? 'yes' : 'no'}`);
    if (report.vm.error) {
      console.log(`  VM error: ${report.vm.error}`);
    }
    if (report.vm.infoAccel) {
      console.log(`  VM info accel: ${report.vm.infoAccel}`);
    }

    if (report.benchmarks.length > 0) {
      console.log('\nMicrobenchmarks');
      for (const bench of report.benchmarks) {
        console.log(`  ${bench.name}`);
        console.log(`    iterations: ${bench.iterations}`);
        console.log(`    avg: ${formatMs(bench.avgMs)} | p95: ${formatMs(bench.p95Ms)} | min/max: ${formatMs(bench.minMs)} / ${formatMs(bench.maxMs)}`);
        console.log(`    total: ${formatMs(bench.totalMs)} | rate: ${formatOps(bench.opsPerSec)}`);
        if (bench.totalBytes !== undefined && bench.throughputMiBps !== undefined) {
          console.log(`    throughput: ${bench.throughputMiBps.toFixed(2)} MiB/s (${bench.totalBytes} bytes total)`);
        }
      }
    }

    if (report.findings.length > 0) {
      console.log('\nFindings');
      for (const finding of report.findings) {
        console.log(`  - ${finding}`);
      }
    }
  },
};
