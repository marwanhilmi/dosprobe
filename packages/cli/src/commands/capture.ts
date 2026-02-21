import type { CommandModule } from 'yargs';
import { parseAddress } from '@dosprobe/core';
import { resolveBackend, getProjectConfig } from '../resolve-backend.ts';

function parseMemoryRanges(specs: string[] | undefined): Array<{ address: ReturnType<typeof parseAddress>; size: number; filename: string }> | undefined {
  if (!specs || specs.length === 0) return undefined;

  return specs.map((spec) => {
    const parts = spec.split(',');
    if (parts.length !== 3) {
      throw new Error(`Invalid --memory "${spec}". Expected "<address>,<size>,<filename>".`);
    }

    const address = parseAddress(parts[0]!.trim());
    const size = Number(parts[1]!.trim());
    if (!Number.isFinite(size) || size <= 0) {
      throw new Error(`Invalid memory size in --memory "${spec}".`);
    }
    const filename = parts[2]!.trim();
    if (filename.length === 0) {
      throw new Error(`Missing filename in --memory "${spec}".`);
    }

    return {
      address,
      size: Math.floor(size),
      filename,
    };
  });
}

export const captureCommand: CommandModule = {
  command: 'capture',
  describe: 'Capture game state (framebuffer, memory, registers)',
  builder: (yargs) =>
    yargs
      .option('snapshot', {
        alias: 's',
        describe: 'Load this snapshot first',
        type: 'string',
      })
      .option('breakpoint', {
        alias: 'bp',
        describe: 'Break at address (hex)',
        type: 'string',
      })
      .option('keys', {
        alias: 'k',
        describe: 'Key sequence to inject (space-separated)',
        type: 'string',
      })
      .option('wait', {
        alias: 'w',
        describe: 'Wait time after keys in seconds (default: 2)',
        type: 'number',
      })
      .option('prefix', {
        describe: 'Output filename prefix',
        type: 'string',
        default: 'capture',
      })
      .option('game', {
        describe: 'Game executable (DOSBox-X)',
        type: 'string',
      })
      .option('iso', {
        describe: 'Game ISO to mount',
        type: 'string',
      })
      .option('timeout', {
        describe: 'Timeout in seconds (default: 45)',
        type: 'number',
      })
      .option('memory', {
        describe: 'Additional memory dump as "<address>,<size>,<filename>" (repeatable)',
        type: 'string',
        array: true,
      }),
  handler: async (argv) => {
    const config = getProjectConfig(argv as Record<string, unknown>);
    const { backend, paths } = await resolveBackend(argv as { backend?: string; project?: string });

    const prefix = argv['prefix'] as string;
    const keysStr = argv['keys'] as string | undefined;
    const keys = keysStr ? keysStr.split(/\s+/) : undefined;
    const bpStr = argv['breakpoint'] as string | undefined;
    const breakpoint = bpStr ? parseAddress(bpStr) : undefined;
    const memoryRanges = parseMemoryRanges(argv['memory'] as string[] | undefined);

    try {
      const result = await backend.capture({
        prefix,
        snapshot: argv['snapshot'] as string | undefined,
        breakpoint,
        keys,
        memoryRanges,
        waitTime: (argv['wait'] as number | undefined) ?? config.capture?.waitTime ?? 2.0,
        timeout: (argv['timeout'] as number | undefined) ?? config.capture?.timeout ?? 45,
      });

      const json = (argv as Record<string, unknown>)['json'] as boolean | undefined;
      if (json) {
        console.log(JSON.stringify({
          prefix: result.prefix,
          timestamp: result.timestamp,
          hasFramebuffer: !!result.framebuffer,
          hasScreenshot: !!result.screenshot,
          hasRegisters: !!result.registers,
          checksums: Object.fromEntries(result.checksums),
        }, null, 2));
      } else {
        console.log(`Capture complete: ${prefix}`);
        console.log(`  Output dir: ${paths.capturesDir}`);
        if (result.framebuffer) {
          console.log(`  Framebuffer: ${result.framebuffer.length} bytes (${result.checksums.get('framebuffer')})`);
        }
        if (result.screenshot) {
          console.log(`  Screenshot: ${result.screenshotFormat} (${result.checksums.get('screenshot')})`);
        }
        if (result.registers) {
          console.log(`  Registers: EIP=0x${result.registers.eip.toString(16)} CS=0x${result.registers.cs.toString(16)}`);
        }
        for (const [name, checksum] of result.checksums) {
          if (name !== 'framebuffer' && name !== 'screenshot') {
            console.log(`  ${name}: ${checksum}`);
          }
        }
      }
    } finally {
      backend.disconnect();
    }
  },
};
