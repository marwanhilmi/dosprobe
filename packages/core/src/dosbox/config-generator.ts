import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class DosboxConfig {
  private sections: Map<string, Map<string, string>> = new Map();
  private autoexecLines: string[] = [];

  constructor(baseConfPath?: string) {
    if (baseConfPath) {
      this.load(baseConfPath);
    } else {
      this.loadDefaults();
    }
  }

  private loadDefaults(): void {
    this.setSection('sdl', {
      output: 'surface',
      windowresolution: 'original',
      autolock: 'false',
    });
    this.setSection('dosbox', { memsize: '16', machine: 'svga_s3' });
    this.setSection('cpu', { cputype: 'auto', cycles: 'max' });
    this.setSection('sblaster', {
      sbtype: 'sb16',
      sbbase: '220',
      irq: '5',
      dma: '1',
      hdma: '5',
    });
    this.autoexecLines = ['MOUNT C drive_c', 'C:'];
  }

  private load(path: string): void {
    const content = readFileSync(path, 'utf-8');
    let currentSection: string | null = null;
    let inAutoexec = false;

    for (const rawLine of content.split('\n')) {
      const line = rawLine.trimEnd();
      const stripped = line.trim();
      if (stripped.startsWith('[') && stripped.endsWith(']')) {
        currentSection = stripped.slice(1, -1).toLowerCase();
        inAutoexec = currentSection === 'autoexec';
        if (!inAutoexec && !this.sections.has(currentSection)) {
          this.sections.set(currentSection, new Map());
        }
      } else if (inAutoexec) {
        this.autoexecLines.push(line);
      } else if (
        currentSection &&
        stripped.includes('=') &&
        !stripped.startsWith('#')
      ) {
        const eqIdx = stripped.indexOf('=');
        const key = stripped.substring(0, eqIdx).trim();
        const value = stripped.substring(eqIdx + 1).trim();
        this.sections.get(currentSection)?.set(key, value);
      }
    }
  }

  set(section: string, key: string, value: string): this {
    const sec = section.toLowerCase();
    if (!this.sections.has(sec)) this.sections.set(sec, new Map());
    this.sections.get(sec)!.set(key, value);
    return this;
  }

  get(section: string, key: string): string | undefined {
    return this.sections.get(section.toLowerCase())?.get(key);
  }

  setAutoexec(lines: string[]): this {
    this.autoexecLines = [...lines];
    return this;
  }

  appendAutoexec(...lines: string[]): this {
    this.autoexecLines.push(...lines);
    return this;
  }

  write(path: string): string {
    mkdirSync(dirname(path), { recursive: true });
    const lines: string[] = [];
    for (const [section, entries] of this.sections) {
      lines.push(`[${section}]`);
      for (const [key, value] of entries) {
        lines.push(`${key}=${value}`);
      }
      lines.push('');
    }
    lines.push('[autoexec]');
    lines.push(...this.autoexecLines);
    writeFileSync(path, lines.join('\n'));
    return path;
  }

  private setSection(name: string, entries: Record<string, string>): void {
    this.sections.set(name, new Map(Object.entries(entries)));
  }
}
