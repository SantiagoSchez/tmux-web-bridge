import { type ChildProcess, execFile } from 'node:child_process';
import type { Config, HostConfig } from './config.js';

// Non-interactive SSH sessions (and launchd/systemd) start with a bare PATH that
// misses Homebrew and snap; tmux usually lives in one of those.
const EXTRA_PATH = '/opt/homebrew/bin:/usr/local/bin:/home/linuxbrew/.linuxbrew/bin:/snap/bin';

/**
 * Quotes one argument for the remote shell. A leading '=' must be quoted too: zsh
 * (the default login shell on macOS) expands "=word" to the path of command "word",
 * which broke tmux's exact-match targets (=_tw-xxxx) over SSH.
 */
export function shq(arg: string): string {
  return /^[A-Za-z0-9_@%+:,./-][A-Za-z0-9_@%+=:,./-]*$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`;
}

/**
 * tmux 3.5 (Debian 13) writes control characters in -F output as octal escapes:
 * the field separators \x1f and \t arrive as the text "\037" and "\011". 3.6 writes
 * them as they are. Turns them back into characters so both split the same.
 */
export function unescapeControls(out: string): string {
  return out.replace(/\\(0[0-3][0-7])/g, (m, oct: string) => {
    const code = parseInt(oct, 8);
    return code < 0x20 ? String.fromCharCode(code) : m;
  });
}

/** Environment for local tmux processes: never inherit the hub's own tmux client. */
function localEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${process.env.PATH ?? '/usr/bin:/bin'}:${EXTRA_PATH}`, LANG: process.env.LANG ?? 'en_US.UTF-8' };
  delete env.TMUX;
  delete env.TMUX_PANE;
  return env;
}

/**
 * Writes `input` to the child's stdin. A child that exits before reading it (tmux with
 * no server, a dropped SSH) makes the write fail with EPIPE, and an unhandled stream
 * error kills the whole hub: ignore it here, the execFile callback reports the real failure.
 */
function feedStdin(child: ChildProcess, input: string | Buffer): void {
  child.stdin?.on('error', () => {});
  child.stdin?.end(input);
}

export class TmuxError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
    readonly code: number | string | null,
  ) {
    super(message);
  }
  /**
   * tmux answers this way when no server is running: an empty host, not a failure.
   * A server kept alive with no sessions (exit-empty off) answers `list-panes -a` with
   * "no current target": just as empty.
   */
  get noServer(): boolean {
    return /no server running|error connecting to|no sessions|no current target/i.test(this.stderr);
  }
  /** The SSH transport failed (exit 255), as opposed to a tmux command error. */
  get transport(): boolean {
    return this.code === 255;
  }
}

export interface Spawnable {
  file: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

/** Runs tmux commands on one host, locally or over SSH (multiplexed with ControlMaster). */
export class TmuxExec {
  constructor(
    readonly host: HostConfig,
    private readonly config: Config,
  ) {}

  private sshArgs(tty: boolean): string[] {
    const h = this.host;
    const args = [
      '-o', 'BatchMode=yes',
      '-o', 'StrictHostKeyChecking=accept-new',
      '-o', 'ConnectTimeout=8',
      '-o', 'ServerAliveInterval=15',
      '-o', 'ServerAliveCountMax=3',
      '-o', 'ControlMaster=auto',
      '-o', `ControlPath=${this.config.sshControlDir}/%C`,
      '-o', 'ControlPersist=10m',
      '-o', 'LogLevel=ERROR',
    ];
    if (h.port) args.push('-p', String(h.port));
    if (h.identityFile) args.push('-i', h.identityFile, '-o', 'IdentitiesOnly=yes');
    for (const opt of h.sshOptions) args.push('-o', opt);
    args.push(tty ? '-tt' : '-T', h.ssh!);
    return args;
  }

  private remoteCommand(tmuxArgs: string[]): string {
    return `PATH="$PATH:${EXTRA_PATH}"; export PATH; exec ${shq(this.host.tmux)} -u ${[...this.host.socketArgs, ...tmuxArgs].map(shq).join(' ')}`;
  }

  /** Command line that runs `tmux <args>` on the host (for node-pty). */
  spawnable(tmuxArgs: string[], tty: boolean): Spawnable {
    if (this.host.local) {
      return { file: this.host.tmux, args: ['-u', ...this.host.socketArgs, ...tmuxArgs], env: localEnv() };
    }
    const env: NodeJS.ProcessEnv = { ...process.env, LANG: process.env.LANG ?? 'en_US.UTF-8' };
    delete env.TMUX;
    delete env.TMUX_PANE;
    return { file: 'ssh', args: [...this.sshArgs(tty), this.remoteCommand(tmuxArgs)], env };
  }

  /** Runs a short POSIX shell script on the host (not through tmux: it may have no server yet). `input` is its stdin. */
  shell(script: string, timeoutMs = 10_000, input?: Buffer): Promise<string> {
    const file = this.host.local ? '/bin/sh' : 'ssh';
    const args = this.host.local ? ['-c', script] : [...this.sshArgs(false), `sh -c ${shq(script)}`];
    const env = this.host.local ? localEnv() : process.env;
    return new Promise((resolve, reject) => {
      const child = execFile(file, args, { env, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' }, (err, stdout, stderr) => {
        if (err) reject(new TmuxError((stderr || err.message).trim().split('\n').slice(-3).join(' '), stderr ?? '', err.killed ? 'timeout' : ((err as { code?: number }).code ?? null)));
        else resolve(stdout);
      });
      feedStdin(child, input ?? '');
    });
  }

  /** Runs a tmux command whose -F format splits fields with control characters (see unescapeControls). */
  async runFormat(tmuxArgs: string[], timeoutMs = 10_000): Promise<string> {
    return unescapeControls(await this.run(tmuxArgs, timeoutMs));
  }

  /** Runs `tmux <args>` and resolves with its stdout. `input` is written to its stdin. */
  run(tmuxArgs: string[], timeoutMs = 10_000, input?: string): Promise<string> {
    const { file, args, env } = this.spawnable(tmuxArgs, false);
    return new Promise((resolve, reject) => {
      const child = execFile(file, args, { env, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, encoding: 'utf8' }, (err, stdout, stderr) => {
        if (err) {
          const code = (err as NodeJS.ErrnoException & { code?: number | string }).code ?? null;
          const msg = (stderr || err.message).trim().split('\n').slice(-3).join(' ');
          reject(new TmuxError(msg, stderr ?? '', err.killed ? 'timeout' : code));
          return;
        }
        resolve(stdout);
      });
      feedStdin(child, input ?? '');
    });
  }
}
