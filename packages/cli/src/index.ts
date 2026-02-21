#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { loadProjectConfig } from '@dosprobe/core';

import { initCommand } from './commands/init.ts';
import { setupCommand } from './commands/setup.ts';
import { launchCommand } from './commands/launch.ts';
import { screenshotCommand } from './commands/screenshot.ts';
import { memoryCommand } from './commands/memory.ts';
import { keysCommand } from './commands/keys.ts';
import { captureCommand } from './commands/capture.ts';
import { registersCommand } from './commands/registers.ts';
import { snapshotCommand } from './commands/snapshot.ts';
import { goldenCommand } from './commands/golden.ts';
import { stateCommand } from './commands/state.ts';
import { debugScriptCommand } from './commands/debug-script.ts';
import { isoCommand } from './commands/iso.ts';
import { serveCommand } from './commands/serve.ts';
import { perfCommand } from './commands/perf.ts';

await yargs(hideBin(process.argv))
  .scriptName('dosprobe')
  .usage('$0 <command> [options]')
  .option('backend', {
    alias: 'b',
    describe: 'Emulator backend',
    choices: ['qemu', 'dosbox'] as const,
  })
  .option('project', {
    alias: 'p',
    describe: 'Project root directory',
    type: 'string',
    default: process.cwd(),
  })
  .option('verbose', {
    alias: 'v',
    describe: 'Verbose output',
    type: 'boolean',
    default: false,
  })
  .option('json', {
    describe: 'Output as JSON',
    type: 'boolean',
    default: false,
  })
  .middleware((argv) => {
    const projectDir = (argv['project'] as string | undefined) ?? process.cwd();
    try {
      const config = loadProjectConfig(projectDir);
      (argv as Record<string, unknown>)['_config'] = config;
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  })
  .command(initCommand)
  .command(setupCommand)
  .command(launchCommand)
  .command(screenshotCommand)
  .command(memoryCommand)
  .command(keysCommand)
  .command(captureCommand)
  .command(registersCommand)
  .command(snapshotCommand)
  .command(goldenCommand)
  .command(stateCommand)
  .command(debugScriptCommand)
  .command(isoCommand)
  .command(serveCommand)
  .command(perfCommand)
  .demandCommand(1, 'You need at least one command')
  .strict()
  .help()
  .parse();
