import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

function hex16(n: number): string {
  return n.toString(16).toUpperCase().padStart(4, '0');
}

function hex8(n: number): string {
  return n.toString(16).toUpperCase().padStart(2, '0');
}

export class DebugScript {
  private commands: string[] = [];

  breakpoint(segment: number, offset: number): this {
    this.commands.push(`BP ${hex16(segment)}:${hex16(offset)}`);
    return this;
  }

  breakpointInterrupt(intNum: number, ah?: number): this {
    const cmd =
      ah !== undefined
        ? `BPINT ${hex8(intNum)} ${hex8(ah)}`
        : `BPINT ${hex8(intNum)}`;
    this.commands.push(cmd);
    return this;
  }

  memoryBreakpoint(segment: number, offset: number): this {
    this.commands.push(`BPM ${hex16(segment)}:${hex16(offset)}`);
    return this;
  }

  continueExec(): this {
    this.commands.push('C');
    return this;
  }

  step(count = 1): this {
    this.commands.push(`T ${count}`);
    return this;
  }

  showRegisters(): this {
    this.commands.push('SR');
    return this;
  }

  memdumpHex(segment: number, offset: number, length: number): this {
    this.commands.push(
      `MEMDUMP ${hex16(segment)}:${hex16(offset)} ${length.toString(16).toUpperCase()}`,
    );
    return this;
  }

  memdumpBin(
    segment: number,
    offset: number,
    length: number,
    filepath: string,
  ): this {
    this.commands.push(
      `MEMDUMPBIN ${hex16(segment)}:${hex16(offset)} ${length.toString(16).toUpperCase()} ${filepath}`,
    );
    return this;
  }

  logInstructions(count: number): this {
    this.commands.push(`LOG ${count}`);
    return this;
  }

  raw(command: string): this {
    this.commands.push(command);
    return this;
  }

  write(path: string): string {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, this.commands.join('\n') + '\n');
    return path;
  }

  toString(): string {
    return this.commands.join('\n');
  }
}
