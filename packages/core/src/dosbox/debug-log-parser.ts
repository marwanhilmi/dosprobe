import { readFileSync, existsSync } from 'node:fs';
import type { Registers } from '../types.ts';

const REGS_32 = [
  'EAX', 'EBX', 'ECX', 'EDX', 'ESI', 'EDI', 'EBP', 'ESP', 'EIP', 'EFLAGS',
] as const;

const REGS_16 = ['CS', 'DS', 'ES', 'SS', 'FS', 'GS'] as const;

function extractRegisters(text: string): Partial<Registers> {
  const regs: Partial<Registers> = {};

  for (const reg of REGS_32) {
    const m = text.match(new RegExp(`${reg}[=:]([0-9A-Fa-f]{8})`));
    if (m) {
      (regs as Record<string, number>)[reg.toLowerCase()] = parseInt(m[1]!, 16);
    }
  }

  for (const reg of REGS_16) {
    const m = text.match(new RegExp(`${reg}[=:]([0-9A-Fa-f]{4})`));
    if (m) {
      (regs as Record<string, number>)[reg.toLowerCase()] = parseInt(m[1]!, 16);
    }
  }

  return regs;
}

export function parseRegisters(logPath: string): Partial<Registers> {
  if (!existsSync(logPath)) return {};
  const text = readFileSync(logPath, 'utf-8');
  return extractRegisters(text);
}

export function parseLastRegisters(logPath: string): Partial<Registers> {
  if (!existsSync(logPath)) return {};
  const text = readFileSync(logPath, 'utf-8');

  // Find all register dump blocks and take the last one
  const blockRegex = /EAX[=:][0-9A-Fa-f]{8}[\s\S]*?(?=EAX[=:]|$)/g;
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(text)) !== null) {
    blocks.push(match[0]);
  }

  if (blocks.length === 0) return extractRegisters(text);
  return extractRegisters(blocks[blocks.length - 1]!);
}
