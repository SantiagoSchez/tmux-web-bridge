import { EventEmitter } from 'node:events';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { UpdateInfo } from '../../shared/types.js';

export const REPO = 'SantiagoSchez/tmux-web-bridge';
const DAY_MS = 24 * 3600_000;
/** How often it asks while the running version has no release yet (GitHub allows 60 an hour). */
const WAITING_MS = 2 * 60_000;

/** The version this hub was built from: VERSION at the repo root (copied next to server/ in the image). */
function readVersion(): string {
  try {
    return readFileSync(new URL('../../VERSION', import.meta.url), 'utf8').trim();
  } catch {
    return '0.0.0';
  }
}

type Release = { version: string; url: string; date: string };

interface Saved {
  enabled: boolean;
  latest: { version: string; url: string } | null;
  checkedAt: number;
  dismissed: string | null;
  /** The release of the running version, as of the last check. */
  current: Release | null;
}

/**
 * Looks for a newer release of twb on GitHub once a day (nothing is sent but the
 * request itself), and remembers the setting and the dismissed notice in dataDir
 * for every device. The web app compares the release with the hub and each host's kit.
 *
 * Events: 'change' (UpdateInfo).
 */
export class UpdateChecker extends EventEmitter {
  readonly current = readVersion();
  private readonly path: string;
  private state: Saved = { enabled: true, latest: null, checkedAt: 0, dismissed: null, current: null };

  constructor(dataDir: string) {
    super();
    this.path = join(dataDir, 'updates.json');
    try {
      if (existsSync(this.path)) this.state = { ...this.state, ...JSON.parse(readFileSync(this.path, 'utf8')) };
    } catch {
      /* unreadable: defaults */
    }
  }

  get info(): UpdateInfo {
    const { enabled, latest, dismissed, current } = this.state;
    const released = current?.version === this.current ? { date: current.date, url: current.url } : null;
    return { enabled, current: this.current, latest, dismissed, released };
  }

  /**
   * Checks now if the last check is a day old (deploys restart the hub often), and then
   * once a day. Without the running version's release (just deployed, its release still a
   * draft) it asks every few minutes until it is out: the kits' notice waits for it.
   */
  start(): void {
    const due = () => {
      const { enabled, checkedAt, current } = this.state;
      if (!enabled) return;
      const waiting = current?.version !== this.current;
      if (Date.now() - checkedAt >= (waiting ? WAITING_MS : DAY_MS)) void this.check();
    };
    // At start, also when its release is missing: a new version was just deployed.
    if (this.state.enabled && (Date.now() - this.state.checkedAt >= DAY_MS || this.state.current?.version !== this.current)) void this.check();
    setInterval(due, WAITING_MS).unref();
  }

  setEnabled(enabled: boolean): void {
    this.save({ enabled });
    if (enabled) void this.check();
  }

  dismiss(version: string): void {
    this.save({ dismissed: version });
  }

  /** A release from GitHub's API (`latest` or `tags/vX.Y.Z`); null when there is none (404). */
  private async release(path: string): Promise<Release | null> {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/${path}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'tmux-web-bridge' },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rel = (await res.json()) as { tag_name: string; html_url: string; published_at: string };
    return { version: rel.tag_name.replace(/^v/, ''), url: rel.html_url, date: rel.published_at };
  }

  private async check(): Promise<void> {
    try {
      const latest = await this.release('latest');
      // The running version's own release, for its date: usually the latest one.
      let current = this.state.current?.version === this.current ? this.state.current : null;
      if (!current) current = latest?.version === this.current ? latest : await this.release(`tags/v${this.current}`);
      this.save({ latest: latest && { version: latest.version, url: latest.url }, current, checkedAt: Date.now() });
    } catch (err) {
      console.warn(`[updates] no se pudo consultar la última versión: ${(err as Error).message}`);
    }
  }

  private save(patch: Partial<Saved>): void {
    this.state = { ...this.state, ...patch };
    try {
      writeFileSync(this.path, JSON.stringify(this.state, null, 2));
    } catch (err) {
      console.warn(`[updates] no se pudo guardar ${this.path}: ${(err as Error).message}`);
    }
    this.emit('change', this.info);
  }
}
