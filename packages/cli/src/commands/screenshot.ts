import { writeFileSync } from 'node:fs';
import { resolveBackend, defineCommand } from '../resolve-backend.ts';

export const screenshotCommand = defineCommand({
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
    const { backend } = await resolveBackend(argv);

    try {
      const { data, format } = await backend.screenshot();
      const outPath = argv.output.endsWith(`.${format}`) ? argv.output : argv.output;
      writeFileSync(outPath, data);
      console.log(`Screenshot saved to ${outPath} (${format}, ${data.length} bytes)`);
    } finally {
      backend.disconnect();
    }
  },
});
