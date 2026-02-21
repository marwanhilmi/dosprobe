import { join } from 'node:path';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import type { CommandModule } from 'yargs';
import { compareWithGolden, parseAddress } from '@dosprobe/core';
import { resolveBackend } from '../resolve-backend.ts';

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

export const goldenCommand: CommandModule = {
  command: 'golden <action>',
  describe: 'Generate or compare golden reference files',
  builder: (yargs) =>
    yargs
      .command(
        'generate',
        'Generate golden reference files',
        (y) =>
          y
            .option('snapshot', {
              alias: 's',
              describe: 'Load this snapshot first',
              type: 'string',
            })
            .option('keys', {
              alias: 'k',
              describe: 'Key sequence to inject',
              type: 'string',
            })
            .option('prefix', {
              describe: 'Test name / output prefix',
              type: 'string',
              default: 'golden',
            })
            .option('game', {
              describe: 'Game executable',
              type: 'string',
            })
            .option('iso', {
              describe: 'Game ISO',
              type: 'string',
            })
            .option('memory', {
              describe: 'Additional memory dump as "<address>,<size>,<filename>" (repeatable)',
              type: 'string',
              array: true,
            }),
        async (argv) => {
          const { backend, paths } = await resolveBackend(argv as { backend?: string; project?: string });
          const prefix = argv['prefix'] as string;
          const keysStr = argv['keys'] as string | undefined;
          const keys = keysStr ? keysStr.split(/\s+/) : undefined;
          const memoryRanges = parseMemoryRanges(argv['memory'] as string[] | undefined);

          try {
            const result = await backend.capture({
              prefix,
              snapshot: argv['snapshot'] as string | undefined,
              keys,
              memoryRanges,
            });

            // Copy artifacts to golden directory
            const goldenDir = paths.goldenDir;
            mkdirSync(goldenDir, { recursive: true });

            if (result.framebuffer) {
              writeFileSync(join(goldenDir, `${prefix}_framebuffer.bin`), result.framebuffer);
            }
            if (result.screenshot) {
              writeFileSync(join(goldenDir, `${prefix}_screenshot.${result.screenshotFormat}`), result.screenshot);
            }
            if (result.registers) {
              writeFileSync(join(goldenDir, `${prefix}_registers.json`), JSON.stringify(result.registers, null, 2));
            }
            for (const [filename, data] of result.memoryDumps) {
              writeFileSync(join(goldenDir, filename), data);
            }
            // Write checksums manifest
            const checksums = Object.fromEntries(result.checksums);
            writeFileSync(join(goldenDir, `${prefix}_checksums.json`), JSON.stringify(checksums, null, 2));

            console.log(`Golden files generated in ${goldenDir}`);
            for (const [name, hash] of result.checksums) {
              console.log(`  ${name}: ${hash}`);
            }
          } finally {
            backend.disconnect();
          }
        },
      )
      .command(
        'compare <test-name>',
        'Compare captures against golden files',
        (y) =>
          y
            .positional('test-name', {
              describe: 'Test name to compare',
              type: 'string',
              demandOption: true,
            })
            .option('snapshot', {
              alias: 's',
              describe: 'Load this snapshot first',
              type: 'string',
            })
            .option('keys', {
              alias: 'k',
              describe: 'Key sequence to inject',
              type: 'string',
            })
            .option('memory', {
              describe: 'Additional memory dump as "<address>,<size>,<filename>" (repeatable)',
              type: 'string',
              array: true,
            }),
        async (argv) => {
          const { backend, paths } = await resolveBackend(argv as { backend?: string; project?: string });
          const testName = argv['test-name'] as string;
          const keysStr = argv['keys'] as string | undefined;
          const keys = keysStr ? keysStr.split(/\s+/) : undefined;
          const memoryRanges = parseMemoryRanges(argv['memory'] as string[] | undefined);

          try {
            const result = await backend.capture({
              prefix: `_compare_${testName}`,
              snapshot: argv['snapshot'] as string | undefined,
              keys,
              memoryRanges,
            });

            const goldenDir = paths.goldenDir;
            let allMatch = true;

            // Compare framebuffer
            if (result.framebuffer) {
              const goldenPath = join(goldenDir, `${testName}_framebuffer.bin`);
              const cmp = compareWithGolden(goldenPath, result.framebuffer);
              if (cmp.match) {
                console.log(`  framebuffer: MATCH (${cmp.actualChecksum})`);
              } else {
                allMatch = false;
                console.log(`  framebuffer: MISMATCH`);
                console.log(`    golden:  ${cmp.goldenChecksum || '(missing)'}`);
                console.log(`    actual:  ${cmp.actualChecksum}`);
                if (cmp.firstDiffOffset !== undefined) {
                  console.log(`    first diff at offset 0x${cmp.firstDiffOffset.toString(16)}`);
                }
              }
            }

            // Compare screenshot
            if (result.screenshot) {
              const ext = result.screenshotFormat;
              const goldenPath = join(goldenDir, `${testName}_screenshot.${ext}`);
              if (existsSync(goldenPath)) {
                const cmp = compareWithGolden(goldenPath, result.screenshot);
                if (cmp.match) {
                  console.log(`  screenshot: MATCH`);
                } else {
                  allMatch = false;
                  console.log(`  screenshot: MISMATCH`);
                }
              }
            }

            for (const [filename, data] of result.memoryDumps) {
              const goldenPath = join(goldenDir, filename);
              const cmp = compareWithGolden(goldenPath, data);
              if (cmp.match) {
                console.log(`  ${filename}: MATCH`);
              } else {
                allMatch = false;
                console.log(`  ${filename}: MISMATCH`);
                console.log(`    golden:  ${cmp.goldenChecksum || '(missing)'}`);
                console.log(`    actual:  ${cmp.actualChecksum}`);
                if (cmp.firstDiffOffset !== undefined) {
                  console.log(`    first diff at offset 0x${cmp.firstDiffOffset.toString(16)}`);
                }
              }
            }

            if (allMatch) {
              console.log(`\nAll golden comparisons PASSED`);
            } else {
              console.log(`\nSome golden comparisons FAILED`);
              process.exitCode = 1;
            }
          } finally {
            backend.disconnect();
          }
        },
      )
      .demandCommand(1),
  handler: () => {},
};
