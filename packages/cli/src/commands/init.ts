import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_FILENAME, writeProjectConfig } from '@dosprobe/core';
import type { ProjectConfig } from '@dosprobe/core';
import { defineCommand } from '../resolve-backend.ts';

export const initCommand = defineCommand({
  command: 'init',
  describe: 'Create a dosprobe.json project config',
  builder: (yargs) =>
    yargs
      .option('force', {
        alias: 'f',
        describe: 'Overwrite existing config',
        type: 'boolean',
        default: false,
      })
      .option('backend', {
        describe: 'Set backend in config',
        choices: ['qemu', 'dosbox'] as const,
        type: 'string',
      }),
  handler: async (argv) => {
    const projectDir = argv.project;
    const force = argv.force;
    const configPath = join(projectDir, CONFIG_FILENAME);

    if (existsSync(configPath) && !force) {
      console.error(`${CONFIG_FILENAME} already exists. Use --force to overwrite.`);
      process.exitCode = 1;
      return;
    }

    const config: ProjectConfig = {};

    // Backend: explicit flag or auto-detect
    if (argv.backend) {
      config.backend = argv.backend;
    } else {
      const hasQemu = existsSync(join(projectDir, 'data', 'qemu', 'vm'));
      const hasDosbox = existsSync(join(projectDir, 'data', 'dosbox', 'drive_c'));
      if (hasQemu && !hasDosbox) config.backend = 'qemu';
      else if (hasDosbox && !hasQemu) config.backend = 'dosbox';
    }

    // Auto-detect ISO from isos/ directory
    const backendType = config.backend ?? 'qemu';
    const isosDir = join(projectDir, 'data', backendType, 'isos');
    try {
      const isoFiles = readdirSync(isosDir).filter((f) => f.toLowerCase().endsWith('.iso'));
      if (isoFiles.length === 1) {
        config.game = { iso: isoFiles[0] };
      }
    } catch { /* isos dir doesn't exist */ }

    writeProjectConfig(projectDir, config);
    console.log(`Created ${configPath}`);
    if (config.backend) console.log(`  backend: ${config.backend}`);
    if (config.game?.iso) console.log(`  game.iso: ${config.game.iso}`);
  },
});
