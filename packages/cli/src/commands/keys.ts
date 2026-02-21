import type { CommandModule } from 'yargs';
import { resolveBackend, getProjectConfig } from '../resolve-backend.ts';

export const keysCommand: CommandModule = {
  command: 'keys <keynames..>',
  describe: 'Send keystrokes to the VM',
  builder: (yargs) =>
    yargs
      .positional('keynames', {
        describe: 'Key names to send (e.g., right up enter)',
        type: 'string',
        array: true,
      })
      .option('delay', {
        alias: 'd',
        describe: 'Delay between keys in ms (default: 150)',
        type: 'number',
      }),
  handler: async (argv) => {
    const keys = argv['keynames'] as string[];
    const config = getProjectConfig(argv as Record<string, unknown>);
    const delay = (argv['delay'] as number | undefined) ?? config.capture?.keyDelay ?? 150;
    const { backend } = await resolveBackend(argv as { backend?: string; project?: string });

    try {
      await backend.sendKeys(keys, delay);
      console.log(`Sent ${keys.length} keys: ${keys.join(' ')}`);
    } finally {
      backend.disconnect();
    }
  },
};
