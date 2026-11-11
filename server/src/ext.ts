import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_COMMAND } from '../../shared/folders.js';
import type { ExtHostTargets, ExtLaunchRequest, ExtLaunchResult, ExtTokenInfo } from '../../shared/types.js';
import { listProjects, openSpace, projectCommand, type MachineFolders } from './actions.js';
import type { HostMonitor } from './host.js';

// The Trello extension: a browser extension that launches a Claude on a card from
// trello.com. It talks to the hub with its own token (Authorization: Bearer), made
// and revoked in Settings › Trello; the hub keeps only its hash, in dataDir/ext-token.json.

const sha256 = (s: string) => createHash('sha256').update(s).digest();

export class ExtTokenStore {
  private readonly file: string;
  private hash: Buffer | null = null;
  private createdAt = 0;

  constructor(dataDir: string) {
    this.file = join(dataDir, 'ext-token.json');
    if (!existsSync(this.file)) return;
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf8')) as { hash?: string; createdAt?: number };
      if (typeof data.hash === 'string' && /^[0-9a-f]{64}$/.test(data.hash)) {
        this.hash = Buffer.from(data.hash, 'hex');
        this.createdAt = Number(data.createdAt) || 0;
      }
    } catch {
      console.warn('[ext] ext-token.json ilegible: la extensión de Trello no tiene token');
    }
  }

  get info(): ExtTokenInfo {
    return this.hash ? { active: true, createdAt: this.createdAt } : { active: false };
  }

  /** A new token, replacing the one there was. Shown once: only its hash is kept. */
  generate(): string {
    const token = `twbx_${randomBytes(32).toString('base64url')}`;
    this.hash = sha256(token);
    this.createdAt = Date.now();
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ hash: this.hash.toString('hex'), createdAt: this.createdAt }), { mode: 0o600 });
    renameSync(tmp, this.file);
    return token;
  }

  revoke(): void {
    this.hash = null;
    this.createdAt = 0;
    rmSync(this.file, { force: true });
  }

  /** Whether an Authorization header carries the token. */
  check(authorization: string | undefined): boolean {
    if (!this.hash) return false;
    const m = /^Bearer\s+(\S+)$/i.exec(authorization ?? '');
    return !!m && timingSafeEqual(sha256(m[1]), this.hash);
  }
}

const MAX_PROMPT = 10_000;
const MAX_WINDOW_NAME = 30;

/** A card's name as a window name: one line, no control characters, cut to fit the list. */
export function taskWindowName(name: unknown): string {
  if (typeof name !== 'string') return '';
  const clean = name.replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/\s+/g, ' ').trim();
  const chars = [...clean];
  return chars.length > MAX_WINDOW_NAME ? `${chars.slice(0, MAX_WINDOW_NAME - 1).join('').trimEnd()}…` : clean;
}

/**
 * One word for the shell (zsh or bash) with the text as is: single quotes, or $'…' when
 * it has new lines or other control characters, which single quotes would send as keys.
 */
export function shellWord(text: string): string {
  if (!/[\x00-\x1f\x7f]/.test(text)) return `'${text.replace(/'/g, `'\\''`)}'`;
  const esc = text.replace(/[\\'\x00-\x1f\x7f]/g, (c) => {
    if (c === '\\' || c === "'") return `\\${c}`;
    if (c === '\n') return '\\n';
    if (c === '\t') return '\\t';
    if (c === '\r') return '\\r';
    return `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`;
  });
  return `$'${esc}'`;
}

/**
 * What is typed to launch a task: the machine's command when it runs claude (any other,
 * or none, gives way to plain claude), with the permission mode chosen and the prompt.
 */
export function taskCommand(command: string, skipPermissions: boolean, prompt: string): string {
  const claude = /^(\S*\/)?claude(\s|$)/.test(command) ? command : DEFAULT_COMMAND;
  return `${projectCommand(claude, skipPermissions)} ${shellWord(prompt)}`;
}

/** Where tasks can go on a machine: its open spaces, and its folders if it answers in time. */
export async function hostTargets(host: HostMonitor, machine: MachineFolders, timeoutMs = 8000): Promise<ExtHostTargets> {
  const info = host.snapshot;
  const out: ExtHostTargets = {
    id: info.id,
    name: info.name,
    status: info.status,
    error: info.error,
    spaces: info.sessions.map((s) => ({ id: s.id, name: s.name, windows: s.windows.length })),
  };
  if (info.status !== 'ok') return out;
  if (!machine.folders.length) {
    out.folders = [];
    return out;
  }
  let timer: NodeJS.Timeout | undefined;
  try {
    const list = await Promise.race([
      listProjects(host, machine.folders),
      new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error('La máquina no ha contestado a tiempo')), timeoutMs))),
    ]);
    out.folders = list.folders;
  } catch (err) {
    out.foldersError = (err as Error).message;
  } finally {
    clearTimeout(timer);
  }
  return out;
}

const SESSION_ID = /^\$\d+$/;

/** tmux expands formats (#{…}) in window names and start folders: a '#' of the text is written '##'. */
export function tmuxLiteral(text: string): string {
  return text.replace(/#/g, '##');
}

/**
 * Launches a task: a new window running claude with the prompt, in an open space or in
 * the space of an added folder. A folder without a space gets one, and the task goes in
 * its first window; with one open, in a new window there, in the folder.
 */
export async function launchTask(host: HostMonitor, machine: MachineFolders, req: Omit<ExtLaunchRequest, 'host'>): Promise<ExtLaunchResult> {
  const prompt = typeof req.prompt === 'string' ? req.prompt.trim() : '';
  if (!prompt) throw new Error('Falta el prompt');
  if (prompt.length > MAX_PROMPT) throw new Error('El prompt es demasiado largo');
  const name = taskWindowName(req.name);
  const target = req.target as Partial<{ session: unknown; folder: unknown; sub: unknown }> | undefined;
  if (!target || typeof target !== 'object') throw new Error('Falta el destino');
  const run = (args: string[]) => host.exec.run(args);

  let session: string;
  let space: string;
  let pane: string | undefined;
  let dir = '#{pane_current_path}';
  let createdSpace = false;
  if (typeof target.session === 'string') {
    if (!SESSION_ID.test(target.session)) throw new Error(`Space inválido: ${target.session}`);
    const found = host.snapshot.sessions.find((s) => s.id === target.session);
    if (!found) throw new Error(`Ese space ya no está abierto en ${host.name}`);
    session = found.id;
    space = found.name;
  } else if (typeof target.folder === 'string') {
    const sub = typeof target.sub === 'string' ? target.sub : undefined;
    const opened = await openSpace(host, machine, { folder: target.folder, sub }, name);
    session = opened.session;
    space = opened.name;
    pane = opened.pane;
    createdSpace = !!opened.pane;
    if (opened.dir) dir = tmuxLiteral(opened.dir);
  } else {
    throw new Error('Falta el destino');
  }

  if (!pane) {
    const args = ['new-window', '-P', '-F', '#{pane_id}', '-t', `${session}:`, '-c', dir];
    if (name) args.push('-n', tmuxLiteral(name));
    pane = (await run(args)).trim();
    if (name) await run(['set-option', '-w', '-t', pane, '@name_pinned', '1']);
  }
  // Typed into the window's shell, as «Nuevo space» does: quitting claude leaves you there.
  await run(['send-keys', '-t', pane, '-l', taskCommand(machine.command, req.skipPermissions === true, prompt)]);
  await run(['send-keys', '-t', pane, 'Enter']);
  const [window, windowName] = (await host.exec.runFormat(['display-message', '-p', '-t', pane, '#{window_id}\t#{window_name}'])).trim().split('\t');
  return { host: host.id, hostName: host.name, session, space, window: window ?? '', windowName: windowName ?? name, pane, createdSpace };
}
