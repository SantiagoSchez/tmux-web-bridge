import type { ScheduledMessageInput } from './types.js';
import { branchNameProblem, runWorktreeName, worktreeNameProblem } from './worktree.js';

// Scheduled messages: a prompt the hub launches once, at a fixed date and time (the right
// panel's «Programados»). The checks the panel runs before sending and the hub runs again
// when it saves one, and the times the form suggests from the account's limits.

export const MAX_SCHEDULED_PROMPT = 10_000;
const MAX_NAME = 60;

/**
 * A scheduled message as kept, from what the panel sent (unknown keys dropped, the name
 * cleaned of control characters, the base only with a worktree), or why it is not one.
 */
export function parseScheduled(raw: unknown, now: Date): ScheduledMessageInput | string {
  if (!raw || typeof raw !== 'object') return 'Mensaje programado inválido';
  const x = raw as Partial<ScheduledMessageInput>;
  const name = typeof x.name === 'string' ? x.name.replace(/[\x00-\x1f\x7f]+/g, ' ').trim().slice(0, MAX_NAME) : '';
  if (!name) return 'Falta el nombre';
  if (typeof x.host !== 'string' || !x.host) return 'Falta la máquina';
  const t = x.target as { folder?: unknown; sub?: unknown } | undefined;
  if (!t || typeof t.folder !== 'string' || !t.folder) return 'Falta la carpeta';
  if (t.sub !== undefined && typeof t.sub !== 'string') return 'Carpeta inválida';
  const prompt = typeof x.prompt === 'string' ? x.prompt.trim() : '';
  if (!prompt) return 'Falta el prompt';
  if (prompt.length > MAX_SCHEDULED_PROMPT) return 'El prompt es demasiado largo';
  if (typeof x.at !== 'number' || !Number.isFinite(x.at)) return 'Falta la fecha y la hora';
  if (x.at <= now.getTime()) return 'Esa hora ya ha pasado';
  const worktree = x.worktree === true;
  const base = worktree && typeof x.base === 'string' ? x.base.trim() : '';
  if (worktree) {
    const wt = worktreeNameProblem(runWorktreeName(name, new Date(x.at)));
    if (wt) return wt;
    const bad = base && branchNameProblem(base);
    if (bad) return bad;
  }
  const out: ScheduledMessageInput = {
    name,
    host: x.host,
    target: typeof t.sub === 'string' && t.sub ? { folder: t.folder, sub: t.sub } : { folder: t.folder },
    prompt,
    worktree,
    skipPermissions: x.skipPermissions === true,
    at: x.at,
  };
  if (base) out.base = base;
  if (typeof x.id === 'string' && x.id) out.id = x.id;
  return out;
}

/** Why the panel cannot save this scheduled message, or null when it can. */
export function scheduledProblem(raw: unknown, now: Date): string | null {
  const r = parseScheduled(raw, now);
  return typeof r === 'string' ? r : null;
}

/** A time the form offers, from the limits of the machine's account. */
export interface LimitSuggestion {
  label: string;
  /** Epoch milliseconds, on the whole minute. */
  at: number;
}

const HOUR = 3_600_000;
const minute = (ms: number) => Math.floor(ms / 60_000) * 60_000;

/**
 * The times to spend what is left of the limits: 1 day, 12 h and 3 h before the weekly
 * limit resets, and when the 5-hour one does (epoch ms, null when unknown). Only those still
 * to come. «1 día antes» is the same clock time the day before, so a change of daylight
 * saving time in between does not move it by an hour.
 */
export function limitSuggestions(now: number, fiveHourReset: number | null, weeklyReset: number | null): LimitSuggestion[] {
  const out: LimitSuggestion[] = [];
  if (weeklyReset) {
    const dayBefore = new Date(weeklyReset);
    dayBefore.setDate(dayBefore.getDate() - 1);
    out.push({ label: '1 día antes del reinicio semanal', at: dayBefore.getTime() });
    out.push({ label: '12 h antes del reinicio semanal', at: weeklyReset - 12 * HOUR });
    out.push({ label: '3 h antes del reinicio semanal', at: weeklyReset - 3 * HOUR });
  }
  if (fiveHourReset) out.push({ label: 'Cuando se reinicie el límite de 5 h', at: fiveHourReset });
  return out.map((s) => ({ ...s, at: minute(s.at) })).filter((s) => s.at > now);
}
