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

/** Two readings of one window that are both still current and start over at different times. */
function differ(a: UsageWindow | undefined, b: UsageWindow | undefined, now: number): boolean {
  if (!a || !b || a.resetsAt <= now || b.resetsAt <= now) return false;
  return Math.abs(a.resetsAt - b.resetsAt) > SAME_RESET;
}

/**
 * Whether a statusline reading published under an account's email is of another
 * account: its 5-hour or weekly window restarts at another time than the one the hub
 * read for that account. Only windows still current on both sides are compared.
 */
export function isForeign(reading: RateLimits, usage: AccountUsage | undefined, now: number): boolean {
  if (!usage) return false;
  return differ(reading.fiveHour, usage.fiveHour, now) || differ(reading.sevenDay, usage.sevenDay, now);
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
