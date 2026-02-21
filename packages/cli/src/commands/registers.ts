import type { CommandModule } from 'yargs';
import { resolveBackend, getProjectConfig } from '../resolve-backend.ts';

function formatRegisters(regs: Record<string, number>): string {
  const lines: string[] = [];
  const gp = ['eax', 'ebx', 'ecx', 'edx', 'esi', 'edi', 'ebp', 'esp'];
  for (const r of gp) {
    if (r in regs) {
      lines.push(`${r.toUpperCase().padStart(4)} = 0x${(regs[r] as number).toString(16).padStart(8, '0')}`);
    }
  }
  if ('eip' in regs) {
    lines.push(` EIP = 0x${(regs['eip'] as number).toString(16).padStart(8, '0')}`);
  }
  if ('eflags' in regs) {
    lines.push(`EFLAGS = 0x${(regs['eflags'] as number).toString(16).padStart(8, '0')}`);
  }
  const seg = ['cs', 'ds', 'es', 'ss', 'fs', 'gs'];
  const segParts: string[] = [];
  for (const s of seg) {
    if (s in regs) {
      segParts.push(`${s.toUpperCase()}=${(regs[s] as number).toString(16).padStart(4, '0')}`);
    }
  }
  if (segParts.length > 0) {
    lines.push(segParts.join(' '));
  }
  return lines.join('\n');
}

export const registersCommand: CommandModule = {
  command: 'registers',
  describe: 'Dump CPU registers',
  builder: (yargs) =>
    yargs
      .option('breakpoint', {
        alias: 'bp',
        describe: 'Break at address first',
        type: 'string',
      })
      .option('game', {
        describe: 'Game executable (DOSBox-X)',
        type: 'string',
      })
      .option('timeout', {
        describe: 'Timeout in seconds (default: 30)',
        type: 'number',
      }),
  handler: async (argv) => {
    const { backend } = await resolveBackend(argv as { backend?: string; project?: string });

    try {
      const regs = await backend.readRegisters();
      const json = (argv as Record<string, unknown>)['json'] as boolean | undefined;
      if (json) {
        console.log(JSON.stringify(regs, null, 2));
      } else {
        console.log(formatRegisters(regs as unknown as Record<string, number>));
      }
    } finally {
      backend.disconnect();
    }
  },
};
