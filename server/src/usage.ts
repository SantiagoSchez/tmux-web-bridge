import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RateLimits, UsageSample } from '../../shared/types.js';

/** Long enough for the weekly forecast, which looks at the last 6 hours. */
const KEEP_SECONDS = 7 * 3600;

/**
 * Recent readings of Claude's usage limits, so the app can tell how fast they are
 * being used up. Kept in dataDir: the hub restarts on every deploy.
 */
export class UsageHistory {
  private readonly file: string;
  private samples: UsageSample[] = [];

  constructor(dataDir: string) {
    this.file = join(dataDir, 'usage.json');
    try {
      if (existsSync(this.file)) this.samples = JSON.parse(readFileSync(this.file, 'utf8'));
    } catch {
      /* unreadable: start over */
    }
  }

  get list(): UsageSample[] {
    return this.samples;
  }

  /** A reading from any host's statusline; false if it is not newer or changes nothing. */
  add(l: RateLimits): boolean {
    const last = this.samples[this.samples.length - 1];
    if (last && l.updatedAt <= last.t) return false;
    const s: UsageSample = { t: l.updatedAt, five: l.fiveHour.pct, fiveReset: l.fiveHour.resetsAt, seven: l.sevenDay.pct, sevenReset: l.sevenDay.resetsAt };
    if (last && s.five === last.five && s.seven === last.seven && s.fiveReset === last.fiveReset && s.sevenReset === last.sevenReset) return false;
    this.samples = [...this.samples.filter((x) => x.t > s.t - KEEP_SECONDS), s];
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.samples));
    renameSync(tmp, this.file);
    return true;
  }
}
