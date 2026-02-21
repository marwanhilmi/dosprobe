import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, parse as parsePath } from 'node:path';
import { mkdirSync } from 'node:fs';

export interface StateInfo {
  name: string;
  file: string;
  size: number;
  modified: Date;
}

export class StateManager {
  readonly statesDir: string;

  constructor(statesDir: string) {
    this.statesDir = statesDir;
    mkdirSync(statesDir, { recursive: true });
  }

  listStates(): StateInfo[] {
    const entries = readdirSync(this.statesDir)
      .filter((f) => f.endsWith('.dsx'))
      .sort();

    return entries.map((f) => {
      const fullPath = join(this.statesDir, f);
      const stat = statSync(fullPath);
      return {
        name: parsePath(f).name,
        file: fullPath,
        size: stat.size,
        modified: stat.mtime,
      };
    });
  }

  statePath(name: string): string {
    return join(this.statesDir, `${name}.dsx`);
  }

  stateExists(name: string): boolean {
    return existsSync(this.statePath(name));
  }
}
