import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseScheduled } from '../../shared/scheduled.js';
import type { ExtLaunchRequest, ExtLaunchResult, ScheduledMessage } from '../../shared/types.js';
import { runWorktreeName } from '../../shared/worktree.js';

// Scheduled messages: prompts the hub launches once, at a fixed date and time (the right
// panel's «Programados»), as a task in a new window of a folder's space, optionally in a new
// worktree. Kept in dataDir/scheduled.json. A message is saved as launching before it is
// launched, so a hub that stops in the middle never launches it twice; one whose time
// passed while the hub was stopped launches on the first check, marked late. Results stay
// 7 days.

const MAX_SCHEDULED = 50;
const TICK_MS = 20_000;
const KEEP_MS = 7 * 86_400_000;
/** Launched later than this after its time: the hub was stopped at it (longer than a tick). */
const LATE_MS = 60_000;

/** What the scheduler needs from the rest of the hub. */
export interface ScheduledDeps {
  /** Launches the message on its machine (throws why it could not). */
  launch(m: ScheduledMessage, req: Omit<ExtLaunchRequest, 'host'>): Promise<ExtLaunchResult>;
  /** Why the machine or the folder is not one of the hub's, or null. */
  check(host: string, target: ScheduledMessage['target']): string | null;
  now?: () => Date;
}

/** A refusal of an edit, with the HTTP status the route answers. */
export class ScheduledError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
  }
}

/**
 * Events: 'change' (ScheduledMessage[]) after every save, 'run' (ScheduledMessage) after
 * each launch or failed launch.
 */
export class ScheduledMessages extends EventEmitter {
  private readonly file: string;
  private messages: ScheduledMessage[] = [];
  private ticking = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    dataDir: string,
    private readonly deps: ScheduledDeps,
  ) {
    super();
    this.file = join(dataDir, 'scheduled.json');
    if (existsSync(this.file)) {
      try {
        const data = JSON.parse(readFileSync(this.file, 'utf8')) as { list?: ScheduledMessage[] };
        this.messages = Array.isArray(data.list) ? data.list.filter((m) => m && typeof m.id === 'string' && typeof m.at === 'number') : [];
      } catch {
        console.warn('[programados] scheduled.json ilegible: sin mensajes programados');
      }
    }
    // The hub stopped while launching these: the window may be open already, so never again.
    const interrupted = this.messages.filter((m) => m.status === 'launching');
    for (const m of interrupted) Object.assign(m, { status: 'error', ranAt: this.now.getTime(), message: 'El hub se reinició mientras lo lanzaba' });
    if (interrupted.length) this.write();
  }

  private get now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  /** The first check comes one interval after the start, once the machines have had their first poll. */
  start(): void {
    this.timer ??= setInterval(() => void this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  get list(): ScheduledMessage[] {
    return this.messages.map((m) => ({ ...m }));
  }

  private write(): void {
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ list: this.messages }, null, 2), { mode: 0o600 });
    renameSync(tmp, this.file);
  }

  private save(): void {
    this.write();
    this.emit('change', this.list);
  }

  private find(id: string): ScheduledMessage {
    const m = this.messages.find((x) => x.id === id);
    if (!m) throw new ScheduledError('Ese mensaje programado ya no existe', 404);
    return m;
  }

  /** Refuses an edit or a removal of a message the hub is launching right now. */
  private notLaunching(m: ScheduledMessage): void {
    if (m.status === 'launching') throw new ScheduledError('Ese mensaje se está lanzando', 409);
  }

  /** A new message (no id) or a change to a pending one; returns it as kept. */
  upsert(raw: unknown): ScheduledMessage {
    const id = typeof (raw as { id?: unknown })?.id === 'string' && (raw as { id: string }).id ? (raw as { id: string }).id : undefined;
    const current = id ? this.find(id) : undefined;
    if (current) {
      this.notLaunching(current);
      if (current.status !== 'pending') throw new ScheduledError('Ese mensaje ya se ha lanzado', 409);
    } else if (this.messages.length >= MAX_SCHEDULED) {
      throw new ScheduledError(`Como mucho ${MAX_SCHEDULED} mensajes programados`, 400);
    }
    const input = parseScheduled(raw, this.now);
    if (typeof input === 'string') throw new ScheduledError(input, 400);
    const bad = this.deps.check(input.host, input.target);
    if (bad) throw new ScheduledError(bad, 400);
    const { id: _ignored, ...fields } = input;
    const m: ScheduledMessage = { ...fields, id: id ?? randomBytes(6).toString('hex'), status: 'pending' };
    this.messages = current ? this.messages.map((x) => (x.id === id ? m : x)) : [...this.messages, m];
    this.save();
    return { ...m };
  }

  /** Cancels a pending message, or removes a result. */
  remove(id: string): void {
    this.notLaunching(this.find(id));
    this.messages = this.messages.filter((x) => x.id !== id);
    this.save();
  }

  /** Drops the results of more than 7 days and launches those whose time came (exported for the tests; the timer calls it). */
  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const now = this.now.getTime();
      const kept = this.messages.filter((m) => m.ranAt === undefined || now - m.ranAt <= KEEP_MS);
      if (kept.length !== this.messages.length) {
        this.messages = kept;
        this.save();
      }
      for (const due of this.messages.filter((x) => x.status === 'pending' && x.at <= now)) {
        // Read again after each launch: one may have been moved or cancelled meanwhile.
        const m = this.messages.find((x) => x.id === due.id);
        if (m?.status === 'pending' && m.at <= now) await this.launch(m);
      }
    } finally {
      this.ticking = false;
    }
  }

  private async launch(m: ScheduledMessage): Promise<void> {
    const startedAt = this.now.getTime();
    const worktree = m.worktree ? runWorktreeName(m.name, new Date(m.at)) : undefined;
    m.status = 'launching';
    if (startedAt > m.at + LATE_MS) m.late = true;
    if (worktree) m.worktreeName = worktree;
    // Saved before launching: a hub that stops now finds it launching and never repeats it.
    this.save();
    const req: Omit<ExtLaunchRequest, 'host'> = { target: m.target, prompt: m.prompt, name: worktree ?? m.name };
    if (worktree) req.worktree = worktree;
    if (worktree && m.base) req.base = m.base;
    req.skipPermissions = m.skipPermissions;
    try {
      const r = await this.deps.launch({ ...m }, req);
      Object.assign(m, { status: 'launched', ranAt: this.now.getTime(), session: r.session, window: r.window, pane: r.pane });
    } catch (err) {
      Object.assign(m, { status: 'error', ranAt: this.now.getTime(), message: (err as Error).message });
    }
    this.save();
    console.log(`[programados] ${m.name}: ${m.status}${m.late ? ' (tarde)' : ''}${m.message ? ` (${m.message})` : ''}`);
    this.emit('run', { ...m });
  }
}
