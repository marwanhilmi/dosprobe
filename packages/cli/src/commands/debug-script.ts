import type { CommandModule } from 'yargs';
import { DebugScript, parseAddress } from '@dosprobe/core';

export const debugScriptCommand: CommandModule = {
  command: 'debug-script',
  describe: 'Generate DOSBox-X debugger command script',
  builder: (yargs) =>
    yargs
      .option('bp', {
        describe: 'Breakpoint address (seg:off or 0xLinear)',
        type: 'string',
        array: true,
      })
      .option('bpint', {
        describe: 'Interrupt breakpoint (nn or nn:ah)',
        type: 'string',
        array: true,
      })
      .option('dump', {
        describe: 'Memory dump: addr,size[,file]',
        type: 'string',
        array: true,
      })
      .option('continue', {
        alias: 'c',
        describe: 'Add continue command',
        type: 'boolean',
        default: false,
      })
      .option('registers', {
        alias: 'r',
        describe: 'Add show-registers command',
        type: 'boolean',
        default: false,
      })
      .option('output', {
        alias: 'o',
        describe: 'Output script path',
        type: 'string',
      }),
  handler: async (argv) => {
    const script = new DebugScript();

    // Add breakpoints
    const bps = (argv['bp'] as string[] | undefined) ?? [];
    for (const bp of bps) {
      const addr = parseAddress(bp);
      script.breakpoint(addr.segOff.segment, addr.segOff.offset);
    }

    // Add interrupt breakpoints
    const bpints = (argv['bpint'] as string[] | undefined) ?? [];
    for (const bpint of bpints) {
      if (bpint.includes(':')) {
        const [intStr, ahStr] = bpint.split(':');
        script.breakpointInterrupt(parseInt(intStr!, 16), parseInt(ahStr!, 16));
      } else {
        script.breakpointInterrupt(parseInt(bpint, 16));
      }
    }

    // Add continue
    if (argv['continue']) {
      script.continueExec();
    }

    // Add memory dumps
    const dumps = (argv['dump'] as string[] | undefined) ?? [];
    for (const dump of dumps) {
      const parts = dump.split(',');
      const addr = parseAddress(parts[0]!);
      const size = parseInt(parts[1]!, 10);
      const file = parts[2];
      if (file) {
        script.memdumpBin(addr.segOff.segment, addr.segOff.offset, size, file);
      } else {
        script.memdumpHex(addr.segOff.segment, addr.segOff.offset, size);
      }
    }

    // Add show registers
    if (argv['registers']) {
      script.showRegisters();
    }

    const output = argv['output'] as string | undefined;
    if (output) {
      script.write(output);
      console.log(`Debug script written to ${output}`);
    } else {
      console.log(script.toString());
    }
  },
};
