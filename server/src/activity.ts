import { EventEmitter } from 'node:events';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ActivityEvent, PaneState } from '../../shared/types.js';
import type { PaneTransition } from './host.js';

// The panel's «Actividad»: what the Claudes did on every machine (asked, wanted
// permission, finished after working so long), the tasks launched and where from, and
// the automations that were skipped or failed. Kept for a week in dataDir/activity.json.

const KEEP_MS = 7 * 86_400_000;
const MAX_EVENTS = 2000;
/** Saved at most this often: transitions come in bursts. */
const SAVE_MS = 5000;

type NewEvent = Omit<ActivityEvent, 'id' | 'at'> & { at?: number };

/**
 * Events: 'add' (ActivityEvent).
 */
export class ActivityLog extends EventEmitter {
  private readonly file: string;
  /** Oldest first. */
  private events: ActivityEvent[] = [];
  private seq = 0;
  /** When each pane started working (busy), to say how long it worked once done. */
  private busySince = new Map<string, number>();
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(
    dataDir: string,
    private readonly now: () => number = Date.now,
  ) {
    super();
    this.file = join(dataDir, 'activity.json');
    if (!existsSync(this.file)) return;
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf8')) as ActivityEvent[];
      if (Array.isArray(data)) this.events = data.filter((e) => e && typeof e.at === 'number' && typeof e.kind === 'string');
      this.seq = this.events.reduce((m, e) => Math.max(m, e.id), 0);
      this.prune();
    } catch {
      console.warn('[activity] activity.json ilegible: empieza vacía');
    }
  }

  /** Newest first. */
  get list(): ActivityEvent[] {
    this.prune();
    return [...this.events].reverse();
  }

  add(e: NewEvent): ActivityEvent {
    const event: ActivityEvent = { ...e, id: ++this.seq, at: e.at ?? this.now() };
    this.events.push(event);
    this.prune();
    this.scheduleSave();
    this.emit('add', event);
    return event;
  }

  /** A pane changed state: working starts the clock; asking, permission and done are events. */
  onTransition(t: PaneTransition): void {
    const key = `${t.host.id}:${t.pane.id}`;
    const now = this.now();
    if (t.to === 'busy') {
      // Back to work after an answer or a permission: the same turn, the same clock.
      const resumed = (t.from === 'question' || t.from === 'attention') && this.busySince.has(key);
      if (!resumed) this.busySince.set(key, now);
      return;
    }
    if (!isEvent(t.to)) {
      if (t.to === null) this.busySince.delete(key);
      return;
    }
    // Claude raises a Notification right after asking: one event, the question.
    if (t.from === 'question' && t.to === 'attention') return;
    const started = this.busySince.get(key);
    if (t.to === 'done') this.busySince.delete(key);
    this.add({
      kind: t.to,
      host: t.host.id,
      hostName: t.host.name,
      space: t.session.name,
      window: t.window.id,
      windowName: t.window.name,
      pane: t.pane.id,
      worked: t.to === 'done' && t.from === 'busy' && started ? now - started : undefined,
    });
  }

  private prune(): void {
    const cutoff = this.now() - KEEP_MS;
    let drop = 0;
    while (drop < this.events.length && this.events[drop].at < cutoff) drop++;
    if (this.events.length - drop > MAX_EVENTS) drop = this.events.length - MAX_EVENTS;
    if (drop) this.events = this.events.slice(drop);
  }

  private scheduleSave(): void {
    this.saveTimer ??= setTimeout(() => {
      this.saveTimer = null;
      this.save();
    }, SAVE_MS);
  }

  save(): void {
    try {
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.events), { mode: 0o600 });
      renameSync(tmp, this.file);
    } catch (err) {
      console.warn(`[activity] no se pudo guardar: ${(err as Error).message}`);
    }
  }
}

function isEvent(s: PaneState | null): s is 'question' | 'attention' | 'done' {
  return s === 'question' || s === 'attention' || s === 'done';
}
