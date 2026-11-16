import type { AccountUsage, ClaudeAccount, HostInfo, RateLimits, UsageWindow } from '../../shared/types.js';

// A statusline labels the limits it publishes with the email in .claude.json, read at
// every repaint, while Claude Code hands it the limits of the account the running
// Claude last talked to Anthropic with. After a machine switches accounts, a Claude
// still on the previous one publishes that one's limits under the new email. The hub
// reads each account itself, so it can tell such a reading apart by its resets.

/**
 * How far apart two resets of one window can be. Anthropic puts them on a grid (the
 * weekly one on the hour, the 5-hour one on 10-minute marks), and both sources carry
 * the same value: this only absorbs rounding.
 */
const SAME_RESET = 300;

/** A window's length and the grid its resets fall on, in seconds. */
interface WindowKind {
  length: number;
  step: number;
}

const FIVE_HOUR: WindowKind = { length: 5 * 3600, step: 600 };
const SEVEN_DAY: WindowKind = { length: 7 * 24 * 3600, step: 3600 };

/**
 * Whether the reading's window cannot be the one the hub saw for the account. A
 * window the reading lacks, or one that has ended, says nothing. When the hub's window
 * is current, the two resets must match. When the hub saw none, or saw it end, the
 * account had no window open then: the reading's cannot have started before that, give
 * or take one step of the grid its start is computed from.
 */
function windowForeign(
  r: UsageWindow | undefined,
  h: UsageWindow | undefined,
  readAt: number,
  kind: WindowKind,
  now: number,
): boolean {
  if (!r || r.resetsAt <= now) return false;
  if (h && h.resetsAt > now) return Math.abs(r.resetsAt - h.resetsAt) > SAME_RESET;
  const closedSince = h && h.resetsAt > 0 ? h.resetsAt : readAt;
  return r.resetsAt - kind.length < closedSince - kind.step;
}

/**
 * Whether a statusline reading published under an account's email is of another
 * account: its 5-hour or weekly window cannot be the one the hub read for that account.
 * An account the hub has never read is not compared.
 */
export function isForeign(reading: RateLimits, usage: AccountUsage | undefined, now: number): boolean {
  if (!usage) return false;
  return (
    windowForeign(reading.fiveHour, usage.fiveHour, usage.t, FIVE_HOUR, now) ||
    windowForeign(reading.sevenDay, usage.sevenDay, usage.t, SEVEN_DAY, now)
  );
}

/** What the hub sends of the statusline readings, once checked. */
export interface LimitsCheck {
  /** The readings of each host the panel and the usage history get (host id → readings). */
  kept: Map<string, RateLimits[]>;
  /** The hosts that published a foreign reading under each account (account id → host ids). */
  mislabelledOn: Map<string, string[]>;
}

/**
 * Checks every host's statusline readings against the hub's own reading of the
 * account with their email. A reading is only checked when exactly one account has
 * that email: with two, it cannot tell which one it is of (the panel ignores it then).
 */
export function checkLimits(hosts: HostInfo[], accounts: ClaudeAccount[], now: number): LimitsCheck {
  const kept = new Map<string, RateLimits[]>();
  const mislabelledOn = new Map<string, string[]>();
  for (const host of hosts) {
    const list: RateLimits[] = [];
    for (const l of host.limits ?? []) {
      const same = accounts.filter((a) => a.email === l.account);
      const acc = same.length === 1 ? same[0] : undefined;
      if (acc && isForeign(l, acc.usage, now)) {
        const on = mislabelledOn.get(acc.id) ?? [];
        if (!on.includes(host.id)) mislabelledOn.set(acc.id, [...on, host.id]);
      } else list.push(l);
    }
    kept.set(host.id, list);
  }
  return { kept, mislabelledOn };
}

/** A host's readings as a key (none and an empty list are the same). */
function limitsKey(limits: RateLimits[] | undefined): string {
  return JSON.stringify(limits ?? []);
}

function mislabelledKey(check: LimitsCheck): string {
  return JSON.stringify([...check.mislabelledOn]);
}

/**
 * What the panel last got of a check: each host's kept readings and every account's
 * machines. It tells a new check's changes apart, so the hub re-sends a host or the
 * accounts only when what they carry moved. It starts as an empty check, which is what
 * the panel has before the first message.
 */
export class SentLimits {
  private readonly hosts = new Map<string, string>();
  private accounts = mislabelledKey({ kept: new Map(), mislabelledOn: new Map() });

  /** The panel got these readings of a host (`undefined`: its statusline shows none). */
  sentHost(id: string, limits: RateLimits[] | undefined): void {
    this.hosts.set(id, limitsKey(limits));
  }

  /** The panel got the accounts with this check's machines. */
  sentAccounts(check: LimitsCheck): void {
    this.accounts = mislabelledKey(check);
  }

  /** A host left the hub. */
  forget(id: string): void {
    this.hosts.delete(id);
  }

  /** The hosts whose kept readings differ from the ones the panel last got. */
  hostsChanged(check: LimitsCheck): string[] {
    return [...check.kept].filter(([id, kept]) => limitsKey(kept) !== (this.hosts.get(id) ?? limitsKey(undefined))).map(([id]) => id);
  }

  /** Whether any account's machines differ from the ones the panel last got. */
  accountsChanged(check: LimitsCheck): boolean {
    return mislabelledKey(check) !== this.accounts;
  }
}
