import { writeFileSync } from 'node:fs';
import type { CommandModule } from 'yargs';
import { parseAddress } from '@dosprobe/core';
import { hexDump, fromHex } from '@dosprobe/shared';
import { resolveBackend } from '../resolve-backend.ts';

export const memoryCommand: CommandModule = {
  command: 'memory <action>',
  describe: 'Read or write guest memory',
  builder: (yargs) =>
    yargs
      .command(
        'read <address> <size>',
        'Read memory from guest',
        (y) =>
          y
            .positional('address', {
              describe: 'Address (hex linear or seg:off)',
              type: 'string',
              demandOption: true,
            })
            .positional('size', {
              describe: 'Size in bytes',
              type: 'number',
              demandOption: true,
            })
            .option('output', {
              alias: 'o',
              describe: 'Output file path (omit for hex dump to stdout)',
              type: 'string',
            }),
        async (argv) => {
          const { backend } = await resolveBackend(argv as { backend?: string; project?: string });

          try {
            const address = parseAddress(argv['address'] as string);
            const size = argv['size'] as number;
            const data = await backend.readMemory(address, size);

            const output = argv['output'] as string | undefined;
            if (output) {
              writeFileSync(output, data);
              console.log(`Wrote ${data.length} bytes to ${output}`);
            } else {
              const json = (argv as Record<string, unknown>)['json'] as boolean | undefined;
              if (json) {
                console.log(JSON.stringify({
                  address: `0x${address.linear.toString(16)}`,
                  size: data.length,
                  data: data.toString('base64'),
                }));
              } else {
                console.log(hexDump(data));
              }
            }
          } finally {
            backend.disconnect();
          }
        },
      )
      .command(
        'write <address> <hexdata>',
        'Write memory to guest',
        (y) =>
          y
            .positional('address', {
              describe: 'Address (hex linear or seg:off)',
              type: 'string',
              demandOption: true,
            })
            .positional('hexdata', {
              describe: 'Hex-encoded data to write',
              type: 'string',
              demandOption: true,
            }),
        async (argv) => {
          const { backend } = await resolveBackend(argv as { backend?: string; project?: string });

          try {
            const address = parseAddress(argv['address'] as string);
            const data = fromHex(argv['hexdata'] as string);
            await backend.writeMemory(address, data);
            console.log(`Wrote ${data.length} bytes to 0x${address.linear.toString(16)}`);
          } finally {
            backend.disconnect();
          }
        },
      )
      .demandCommand(1),
  handler: () => {},
};
