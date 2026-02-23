import type { CommandModule } from 'yargs';
import { StateManager } from '@dosprobe/core';
import { resolvePaths } from '../resolve-backend.ts';
import type { GlobalArgs } from '../resolve-backend.ts';

export const stateCommand: CommandModule<GlobalArgs, GlobalArgs> = {
  command: 'state <action>',
  describe: 'Manage DOSBox-X save states',
  builder: (yargs) =>
    yargs
      .command('list', 'List save states', (y) => y, async (argv) => {
        const projectDir = argv.project;
        const paths = resolvePaths(projectDir, 'dosbox');
        const mgr = new StateManager(paths.statesDir);
        const states = mgr.listStates();

        if (argv.json) {
          console.log(JSON.stringify(states, null, 2));
        } else if (states.length === 0) {
          console.log('No DOSBox-X save states found.');
        } else {
          for (const s of states) {
            const sizeMB = (s.size / 1024 / 1024).toFixed(1);
            console.log(`  ${s.name}  ${sizeMB} MB  ${s.modified.toISOString()}`);
          }
        }
      })
      .command(
        'info <name>',
        'Show save state info',
        (y) =>
          y.positional('name', {
            describe: 'State name',
            type: 'string',
            demandOption: true,
          }),
        async (argv) => {
          const projectDir = argv.project;
          const paths = resolvePaths(projectDir, 'dosbox');
          const mgr = new StateManager(paths.statesDir);
          const name = argv.name;

          if (!mgr.stateExists(name)) {
            console.error(`State "${name}" not found in ${paths.statesDir}`);
            process.exitCode = 1;
            return;
          }

          const states = mgr.listStates();
          const state = states.find((s) => s.name === name);
          if (state) {
            if (argv.json) {
              console.log(JSON.stringify(state, null, 2));
            } else {
              console.log(`Name:     ${state.name}`);
              console.log(`File:     ${state.file}`);
              console.log(`Size:     ${(state.size / 1024 / 1024).toFixed(1)} MB`);
              console.log(`Modified: ${state.modified.toISOString()}`);
            }
          }
        },
      )
      .demandCommand(1),
  handler: () => {},
};
