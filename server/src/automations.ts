import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { nextRun, scheduleProblem, type Schedule } from '../../shared/schedule.js';
import type { Automation, AutomationInfo, AutomationRun, ExtLaunchResult, PaneState } from '../../shared/types.js';
import { runWorktreeName, worktreeNameProblem } from '../../shared/worktree.js';

// Automations: prompts the hub launches on its own on a schedule (Settings ›
// Automatizaciones), as a task in a new window of a folder's space, optionally in a new
// worktree per run. Kept in dataDir/automations.json with their last runs. A run whose
// previous one is still at it (its Claude working or waiting for you) is skipped.

const MAX_AUTOMATIONS = 50;
const MAX_RUNS = 20;
const MAX_PROMPT = 10_000;
const TICK_MS = 20_000;

/** What the scheduler needs from the rest of the hub. */
export interface AutomationDeps {
  /** Launches one run (throws why it could not). */
  launch(a: Automation, worktree: string | undefined): Promise<ExtLaunchResult>;
  /** The state of a pane: undefined when it is gone, null when nothing runs in it. */
  paneState(host: string, pane: string): PaneState | null | undefined;
  now?: () => Date;
}

/** Still at it: its Claude is working or waiting for an answer. */
const BUSY: ReadonlySet<PaneState> = new Set(['busy', 'question', 'attention']);

interface Saved {
  list: Automation[];
  runs: Record<string, AutomationRun[]>;
}

/**
 * Events: 'change' (AutomationInfo[]), 'run' (Automation, AutomationRun).
 */
export class Automations extends EventEmitter {
  private readonly file: string;
  private list: Automation[] = [];
  private runs: Record<string, AutomationRun[]> = {};
  /** When each enabled one runs next (epoch ms), from when the hub started or it changed: missed runs are not caught up. */
  private next = new Map<string, number>();
  private running = new Set<string>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    dataDir: string,
    private readonly deps: AutomationDeps,
  ) {
    super();
    this.file = join(dataDir, 'automations.json');
    if (existsSync(this.file)) {
      try {
        const data = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<Saved>;
        this.list = (data.list ?? []).map((a) => sanitize(a, a.id)).filter((a): a is Automation => !!a);
        this.runs = data.runs ?? {};
      } catch {
        console.warn('[automations] automations.json ilegible: sin automatizaciones');
      }
    }
    for (const a of this.list) this.plan(a);
  }

  private get now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  start(): void {
    this.timer ??= setInterval(() => void this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private plan(a: Automation): void {
    const at = a.enabled ? nextRun(a.schedule, this.now) : null;
    if (at) this.next.set(a.id, at.getTime());
    else this.next.delete(a.id);
  }

  private save(): void {
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ list: this.list, runs: this.runs } satisfies Saved, null, 2), { mode: 0o600 });
    renameSync(tmp, this.file);
    this.emit('change', this.info);
  }

  get info(): AutomationInfo[] {
    return this.list.map((a) => ({ ...a, nextRun: this.next.get(a.id) ?? null, runs: this.runs[a.id] ?? [] }));
  }

  /** A new one (no id) or a change to one; returns it as kept. */
  upsert(raw: unknown): AutomationInfo {
    const id = typeof (raw as { id?: unknown })?.id === 'string' && (raw as { id: string }).id ? (raw as { id: string }).id : undefined;
    if (id && !this.list.some((a) => a.id === id)) throw new Error('Esa automatización ya no existe');
    if (!id && this.list.length >= MAX_AUTOMATIONS) throw new Error(`Como mucho ${MAX_AUTOMATIONS} automatizaciones`);
    const a = sanitize(raw, id ?? randomBytes(6).toString('hex'), true);
    if (!a) throw new Error('Automatización inválida');
    this.list = id ? this.list.map((x) => (x.id === id ? a : x)) : [...this.list, a];
    this.plan(a);
    this.save();
    return this.info.find((x) => x.id === a.id)!;
  }

  remove(id: string): void {
    if (!this.list.some((a) => a.id === id)) throw new Error('Esa automatización ya no existe');
    this.list = this.list.filter((a) => a.id !== id);
    delete this.runs[id];
    this.next.delete(id);
    this.save();
  }

  /** «Ejecutar ahora»: one run out of schedule (also skipped if the last one is still at it). */
  async runNow(id: string): Promise<AutomationRun> {
    const a = this.list.find((x) => x.id === id);
    if (!a) throw new Error('Esa automatización ya no existe');
    return this.run(a, true);
  }

  /** Runs those whose time came (exported for the tests; the timer calls it). */
  async tick(): Promise<void> {
    const now = this.now.getTime();
    const due = this.list.filter((a) => a.enabled && (this.next.get(a.id) ?? Infinity) <= now);
    for (const a of due) {
      // The next one is planned before running, so a slow launch never runs it twice.
      const after = nextRun(a.schedule, new Date(now));
      if (after) this.next.set(a.id, after.getTime());
      else this.next.delete(a.id);
      await this.run(a, false);
    }
  }

  private async run(a: Automation, manual: boolean): Promise<AutomationRun> {
    if (this.running.has(a.id)) return this.record(a, { at: Date.now(), status: 'skipped', manual, message: 'Ya se estaba lanzando' });
    const last = (this.runs[a.id] ?? []).find((r) => r.status === 'launched');
    if (last?.pane) {
      const state = this.deps.paneState(a.host, last.pane);
      if (state && BUSY.has(state)) {
        return this.record(a, { at: Date.now(), status: 'skipped', manual, message: 'La anterior seguía trabajando', session: last.session, window: last.window, pane: last.pane });
      }
    }
    this.running.add(a.id);
    const worktree = a.worktree ? runWorktreeName(a.name, this.now) : undefined;
    try {
      const r = await this.deps.launch(a, worktree);
      return this.record(a, { at: Date.now(), status: 'launched', manual, session: r.session, window: r.window, pane: r.pane, worktree });
    } catch (err) {
      return this.record(a, { at: Date.now(), status: 'error', manual, message: (err as Error).message, worktree });
    } finally {
      this.running.delete(a.id);
    }
  }

  private record(a: Automation, run: AutomationRun): AutomationRun {
    this.runs[a.id] = [run, ...(this.runs[a.id] ?? [])].slice(0, MAX_RUNS);
    if (this.list.some((x) => x.id === a.id)) this.save();
    console.log(`[automations] ${a.name}: ${run.status}${run.message ? ` (${run.message})` : ''}`);
    this.emit('run', a, run);
    return run;
  }
}

/** An automation as kept, from what the panel sent; null (or, `strict`, an error) when it is not one. */
function sanitize(raw: unknown, id: string, strict = false): Automation | null {
  const fail = (why: string) => {
    if (strict) throw new Error(why);
    return null;
  };
  if (!raw || typeof raw !== 'object') return fail('Automatización inválida');
  const x = raw as Partial<Automation>;
  const name = typeof x.name === 'string' ? x.name.replace(/[\x00-\x1f\x7f]+/g, ' ').trim().slice(0, 60) : '';
  if (!name) return fail('Falta el nombre');
  if (typeof x.host !== 'string' || !x.host) return fail('Falta la máquina');
  const t = x.target as { folder?: unknown; sub?: unknown } | undefined;
  if (!t || typeof t.folder !== 'string' || !t.folder) return fail('Falta la carpeta');
  if (t.sub !== undefined && typeof t.sub !== 'string') return fail('Carpeta inválida');
  const prompt = typeof x.prompt === 'string' ? x.prompt.trim() : '';
  if (!prompt) return fail('Falta el prompt');
  if (prompt.length > MAX_PROMPT) return fail('El prompt es demasiado largo');
  const problem = scheduleProblem(x.schedule);
  if (problem) return fail(problem);
  if (x.worktree === true) {
    const wt = worktreeNameProblem(runWorktreeName(name, new Date()));
    if (wt) return fail(wt);
  }
  const s = x.schedule as Schedule;
  const schedule: Schedule =
    s.kind === 'days' ? { kind: 'days', days: [...new Set(s.days)].sort(), time: s.time } : s.kind === 'every' ? { kind: 'every', hours: s.hours, minute: s.minute } : { kind: 'cron', expr: s.expr.trim().replace(/\s+/g, ' ') };
  return {
    id,
    name,
    enabled: x.enabled !== false,
    host: x.host,
    target: t.sub ? { folder: t.folder, sub: t.sub } : { folder: t.folder },
    prompt,
    worktree: x.worktree === true,
    skipPermissions: x.skipPermissions === true,
    schedule,
  };
}
