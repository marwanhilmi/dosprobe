import { spawn, type ChildProcess } from 'node:child_process';
import { resolveDosboxBinary } from '../util.ts';

export class DosboxSession {
  private process: ChildProcess | null = null;
  readonly configPath: string;
  readonly workingDir: string;

  constructor(configPath: string, workingDir: string) {
    this.configPath = configPath;
    this.workingDir = workingDir;
  }

  async launch(options: {
    extraArgs?: string[];
    wait?: boolean;
    timeout?: number;
    dosboxBin?: string;
    env?: NodeJS.ProcessEnv;
  } = {}): Promise<{ stdout: string; stderr: string } | ChildProcess> {
    const {
      extraArgs,
      wait = true,
      timeout = 60,
      dosboxBin: preferredBin,
      env,
    } = options;

    const dosboxBin = resolveDosboxBinary(preferredBin);
    if (!dosboxBin) {
      throw new Error(
        'DOSBox-X binary not found. Set DOSBOX_X_BIN or install dosbox-x in PATH.',
      );
    }
    const args = ['-conf', this.configPath, ...(extraArgs ?? [])];

    this.process = spawn(dosboxBin, args, {
      cwd: this.workingDir,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (!wait) return this.process;

    return new Promise((resolve) => {
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      this.process!.stdout?.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
      this.process!.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

      const timer = setTimeout(() => {
        this.process!.kill();
      }, timeout * 1000);

      this.process!.on('close', () => {
        clearTimeout(timer);
        resolve({
          stdout: Buffer.concat(stdoutChunks).toString(),
          stderr: Buffer.concat(stderrChunks).toString(),
        });
      });
    });
  }

  kill(): void {
    if (this.process && this.process.exitCode === null) {
      this.process.kill();
    }
  }

  getPid(): number | undefined {
    return this.process?.pid;
  }
}
