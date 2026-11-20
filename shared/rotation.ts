// The automatic account switch (Ajustes › Máquinas): when a machine's Claude account
// reaches a threshold of its 5-hour or weekly limit, the hub moves the machine to
// another account it holds a spare login of. This module holds the whole decision as
// pure logic; server/src/rotation.ts gathers its inputs, switches and reports.

import type { AccountRotationSettings, AccountUsage, ClaudeAccount, RateLimits, UsageLimit, UsageWindow } from './types.js';

/** 90 % of the 5-hour limit, 95 % of the weekly one, on no machine. */
export const DEFAULT_ACCOUNT_ROTATION: AccountRotationSettings = { fiveHour: 90, sevenDay: 95, hosts: [] };

/** With no account below the thresholds, a target must be at least this many points less used. */
export const FALLBACK_MARGIN = 10;

/** How long after a failed switch the hub tries it again, in seconds. */
export const RETRY_AFTER = 300;

/** The reason of the failure reported for a machine that is not connected. */
export const OFFLINE_REASON = 'sin conexión';

/** The step of Anthropic's grid of resets, per limit (seconds): 10 minutes for 5 hours, 1 hour for 7 days. */
const RESET_STEP: Record<UsageLimit, number> = { fiveHour: 600, sevenDay: 3600 };

/**
 * The name of an account's window of a limit. The reset is rounded to Anthropic's grid:
 * the hub's reading and a statusline's of one window may carry resets a few seconds
 * apart, and each is in turn the freshest. A reset of 0 (unknown) stays 0. The account
 * is part of it: two accounts' windows may reset at the same time.
 */
function windowKey(account: string, limit: UsageLimit, reset: number): string {
  const step = RESET_STEP[limit];
  return `${account}:${limit}:${Math.round(reset / step) * step}`;
}

/** What `failed` keeps of a reported failure: its window and its reason, so another reason is reported. */
export function failureKey(window: string, reason: string): string {
  return `${window}|${reason}`;
}

const isThreshold = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 100;

/**
 * The settings `raw` asks for, field by field: a field whose value is not valid keeps
 * the one of `previous`. Thresholds are whole percentages from 1 to 100; `hosts` is a
 * list of non-empty ids, each once.
 */
export function sanitizeAccountRotation(raw: unknown, previous: AccountRotationSettings): AccountRotationSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return previous;
  const r = raw as Record<string, unknown>;
  const hosts = Array.isArray(r.hosts) ? [...new Set(r.hosts.filter((h): h is string => typeof h === 'string' && h.length > 0))] : previous.hosts;
  return {
    fiveHour: isThreshold(r.fiveHour) ? r.fiveHour : previous.fiveHour,
    sevenDay: isThreshold(r.sevenDay) ? r.sevenDay : previous.sevenDay,
    hosts,
  };
}

/** An account's 5-hour and weekly usage right now, in %, with the resets of their windows (epoch seconds). */
export interface AccountUsageNow {
  five: number;
  seven: number;
  fiveReset: number;
  sevenReset: number;
}

/** An account as the decision sees it. */
export interface RotationAccount {
  id: string;
  alias: string;
  /** null: neither the hub nor a statusline has read it. */
  usage: AccountUsageNow | null;
  /** Machines on it right now. */
  activeOn: string[];
  /** Logins the hub holds that no machine uses: a machine can only go to an account with one. */
  spare: number;
  /** false when its usage could not be read last time or it needs a new login. */
  usable: boolean;
}

/** A machine as the decision sees it. */
export interface RotationMachine {
  id: string;
  /** Its Claude account (id), null when logged out or unknown. */
  account: string | null;
  connected: boolean;
  /** A switch of its account is under way. */
  switching: boolean;
}

/** What the hub remembers of earlier decisions, by machine id. */
export interface RotationMemory {
  /** The account each machine left in its last automatic switch. */
  left: Record<string, string>;
  /**
   * Per machine and limit, the window each machine was warned about having no target
   * in. Per limit: over both thresholds, the limit reported may change from one
   * decision to the next, and each must not erase the other.
   */
  warned: Record<string, Partial<Record<UsageLimit, string>>>;
  /** Per machine and limit, the window and the reason (`failureKey`) of the reported failure. */
  failed: Record<string, Partial<Record<UsageLimit, string>>>;
  /** When each machine whose switch failed may be tried again (epoch seconds). */
  retryAt: Record<string, number>;
}

export interface RotationInput {
  settings: AccountRotationSettings;
  accounts: RotationAccount[];
  /** In the panel's order: the first one that needs something is decided first. */
  machines: RotationMachine[];
  memory: RotationMemory;
  /** Machines already handled in this round. */
  skip: string[];
  /** Epoch seconds. */
  now: number;
}

/**
 * What to do with one machine. `limit` and `pct` say which limit of `from` was passed
 * and how far; `window` names that limit's window, so a warning or a failure is
 * reported once in it. switch: move it to `to`, with `targetWindow`, the limit and window of the
 * limit `to` passed, when `to` is itself over a threshold; stuck: it has no target;
 * offline: it has one, `to`, but is not connected.
 */
export type RotationAction =
  | { kind: 'switch'; host: string; from: string; to: string; limit: UsageLimit; pct: number; window: string; targetWindow?: { limit: UsageLimit; window: string } }
  | { kind: 'stuck'; host: string; from: string; limit: UsageLimit; pct: number; window: string }
  | { kind: 'offline'; host: string; from: string; to: string; limit: UsageLimit; pct: number; window: string };

/** A window's % now: 0 once its reset has passed (a reset of 0 is unknown and keeps it). */
function pctNow(w: UsageWindow | undefined, now: number): number {
  if (!w) return 0;
  return w.resetsAt > 0 && w.resetsAt <= now ? 0 : w.pct;
}

function usageNow(fiveHour: UsageWindow | undefined, sevenDay: UsageWindow | undefined, now: number): AccountUsageNow {
  return { five: pctNow(fiveHour, now), seven: pctNow(sevenDay, now), fiveReset: fiveHour?.resetsAt ?? 0, sevenReset: sevenDay?.resetsAt ?? 0 };
}

/**
 * The freshest reading of an account the hub trusts: its own (`usage`) or a statusline
 * reading among `readings`, which must already be the account's and not foreign.
 */
function freshest(usage: AccountUsage | undefined, readings: RateLimits[], now: number): AccountUsageNow | null {
  const last = readings.reduce<RateLimits | undefined>((best, r) => (!best || r.updatedAt > best.updatedAt ? r : best), undefined);
  if (last && (!usage || last.updatedAt > usage.t)) return usageNow(last.fiveHour, last.sevenDay, now);
  return usage ? usageNow(usage.fiveHour, usage.sevenDay, now) : null;
}

/**
 * The accounts as the decision sees them. `readings` are the statusline readings the
 * hub kept (none foreign); one is an account's when its email is that account's and no
 * other account has the same email. The weekly limits of a single model do not count.
 */
export function rotationAccounts(list: ClaudeAccount[], readings: RateLimits[], now: number): RotationAccount[] {
  return list.map((a) => {
    const unique = list.filter((b) => b.email === a.email).length === 1;
    const own = unique ? readings.filter((r) => r.account === a.email) : [];
    return {
      id: a.id,
      alias: a.alias,
      usage: freshest(a.usage, own, now),
      activeOn: a.activeOn,
      spare: a.spare,
      usable: !a.usageError && !a.needsLogin,
    };
  });
}

/** The higher of an account's two percentages: how used it is, to rank and compare accounts. */
const used = (u: AccountUsageNow) => Math.max(u.five, u.seven);

/** The limit `u` passed (the 5-hour one when both), or null when it is below both thresholds. */
function passed(account: string, u: AccountUsageNow, s: AccountRotationSettings): { limit: UsageLimit; pct: number; window: string } | null {
  if (u.five >= s.fiveHour) return { limit: 'fiveHour', pct: u.five, window: windowKey(account, 'fiveHour', u.fiveReset) };
  if (u.seven >= s.sevenDay) return { limit: 'sevenDay', pct: u.seven, window: windowKey(account, 'sevenDay', u.sevenReset) };
  return null;
}

/** Free accounts first, then the least used, then by id so the choice is stable. */
function byPreference(a: RotationAccount & { usage: AccountUsageNow }, b: RotationAccount & { usage: AccountUsageNow }): number {
  const free = Number(a.activeOn.length > 0) - Number(b.activeOn.length > 0);
  return free || used(a.usage) - used(b.usage) || a.id.localeCompare(b.id);
}

/** The account a machine over a threshold should go to, if any. */
function target(m: RotationMachine, current: AccountUsageNow, input: RotationInput): (RotationAccount & { usage: AccountUsageNow }) | null {
  const { settings, accounts, memory } = input;
  const candidates = accounts
    .filter((a): a is RotationAccount & { usage: AccountUsageNow } => a.id !== m.account && a.spare > 0 && a.usable && a.usage !== null)
    // The account the machine left is no target while it stays over a threshold.
    .filter((a) => !(memory.left[m.id] === a.id && passed(a.id, a.usage, settings)))
    .sort(byPreference);
  const below = candidates.find((a) => !passed(a.id, a.usage, settings));
  if (below) return below;
  const least = [...candidates].sort((a, b) => used(a.usage) - used(b.usage) || a.id.localeCompare(b.id))[0];
  return least && used(least.usage) <= used(current) - FALLBACK_MARGIN ? least : null;
}

/**
 * The next thing to do: for the first machine (not in `skip`, with the switch on, not
 * being switched) whose account passed a threshold, a switch to its target unless a
 * failed one waits for its retry time, or the report that it has none or is not
 * connected, once per window. null: nothing to do.
 */
export function decideRotation(input: RotationInput): RotationAction | null {
  const { settings, accounts, machines, memory, skip, now } = input;
  for (const m of machines) {
    if (!m.account || m.switching || skip.includes(m.id) || !settings.hosts.includes(m.id)) continue;
    const current = accounts.find((a) => a.id === m.account)?.usage;
    if (!current) continue;
    const over = passed(m.account, current, settings);
    if (!over) continue;
    const base = { host: m.id, from: m.account, ...over };
    const to = target(m, current, input);
    if (!to) {
      if (memory.warned[m.id]?.[over.limit] !== over.window) return { kind: 'stuck', ...base };
      continue;
    }
    if (!m.connected) {
      if (memory.failed[m.id]?.[over.limit] !== failureKey(over.window, OFFLINE_REASON)) return { kind: 'offline', ...base, to: to.id };
      continue;
    }
    if ((memory.retryAt[m.id] ?? 0) > now) continue;
    const toOver = passed(to.id, to.usage, settings);
    return toOver ? { kind: 'switch', ...base, to: to.id, targetWindow: { limit: toOver.limit, window: toOver.window } } : { kind: 'switch', ...base, to: to.id };
  }
  return null;
}
