import { writeFileSync } from 'node:fs';
import type { CommandModule } from 'yargs';
import { resolveBackend } from '../resolve-backend.ts';

export const screenshotCommand: CommandModule = {
  command: 'screenshot',
  describe: 'Take a screenshot',
  builder: (yargs) =>
    yargs.option('output', {
      alias: 'o',
      describe: 'Output file path',
      type: 'string',
      default: 'screenshot.ppm',
    }),
  handler: async (argv) => {
    const output = argv['output'] as string;
    const { backend } = await resolveBackend(argv as { backend?: string; project?: string });

    try {
      const { data, format } = await backend.screenshot();
      const outPath = output.endsWith(`.${format}`) ? output : output;
      writeFileSync(outPath, data);
      console.log(`Screenshot saved to ${outPath} (${format}, ${data.length} bytes)`);
    } finally {
      backend.disconnect();
    }
  },
};
