import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { CommandModule } from 'yargs';
import { which } from '@dosprobe/core';
import { resolvePaths, ensureDirs } from '../resolve-backend.ts';

export const isoCommand: CommandModule = {
  command: 'iso <action>',
  describe: 'Manage shared ISO (QEMU)',
  builder: (yargs) =>
    yargs.command(
      'rebuild',
      'Rebuild shared ISO from shared/ directory',
      (y) =>
        y.option('source', {
          describe: 'Source directory for ISO contents',
          type: 'string',
        }),
      async (argv) => {
        const projectDir = (argv['project'] as string | undefined) ?? process.cwd();
        const paths = resolvePaths(projectDir, 'qemu');
        ensureDirs(paths);

        const sourceDir = (argv['source'] as string | undefined) ?? paths.sharedDir;
        if (!existsSync(sourceDir)) {
          console.error(`Source directory not found: ${sourceDir}`);
          process.exitCode = 1;
          return;
        }

        // Find mkisofs or genisoimage
        const mkisofs = which('mkisofs') ?? which('genisoimage');
        if (!mkisofs) {
          console.error('mkisofs or genisoimage not found in PATH');
          console.error('Install with: brew install cdrtools (macOS) or apt install genisoimage (Linux)');
          process.exitCode = 1;
          return;
        }

        const isoPath = paths.sharedIso;
        const cmd = `"${mkisofs}" -o "${isoPath}" -J -R -l -allow-lowercase -allow-multidot "${sourceDir}"`;

        console.log(`Building ISO from ${sourceDir}...`);
        try {
          execSync(cmd, { stdio: 'inherit' });
          console.log(`ISO rebuilt: ${isoPath}`);
        } catch (err) {
          console.error('Failed to build ISO');
          process.exitCode = 1;
        }
      },
    ).demandCommand(1),
  handler: () => {},
};
