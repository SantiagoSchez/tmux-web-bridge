import { randomBytes } from 'node:crypto';
import type { PanePreview, PreviewsResponse } from '../../shared/types.js';
import type { HostMonitor } from './host.js';

/** A capture younger than this is served as is: the grid polls every 2 s, maybe from several browsers. */
const FRESH_MS = 1500;

interface Entry extends PanePreview {
  rev: number;
}

/**
 * Screens of every pane for the windows grid, taken on demand while some browser
 * shows it. One tmux command per host captures all its panes; each pane keeps the
 * revision of its last change, so a browser only downloads what changed since its
 * previous poll.
 */
export class PreviewCache {
  /** Starts at the clock so revisions keep growing across hub restarts. */
  private rev = Date.now();
  private readonly entries = new Map<string, Map<string, Entry>>();
  private readonly takenAt = new Map<string, number>();
  private readonly inflight = new Map<string, Promise<void>>();
  /** Line that precedes each pane's capture; random, so no screen can fake it. */
  private readonly mark = `twb-preview-${randomBytes(6).toString('hex')}`;

  constructor(private readonly hosts: Map<string, HostMonitor>) {}

  async get(since: number): Promise<PreviewsResponse> {
    await Promise.all([...this.hosts.values()].map((h) => this.refresh(h)));
    const panes: Record<string, PanePreview> = {};
    const alive: string[] = [];
    for (const [hostId, map] of this.entries) {
      for (const [paneId, { rev, ...preview }] of map) {
        const key = `${hostId}:${paneId}`;
        alive.push(key);
        if (rev > since) panes[key] = preview;
      }
    }
    return { rev: this.rev, panes, alive };
  }

  private refresh(host: HostMonitor): Promise<void> {
    if (host.snapshot.status !== 'ok') {
      this.entries.delete(host.id);
      return Promise.resolve();
    }
    if (Date.now() - (this.takenAt.get(host.id) ?? 0) < FRESH_MS) return Promise.resolve();
    let p = this.inflight.get(host.id);
    if (!p) {
      // A failed capture (a pane closed meanwhile) keeps the previous screens until the next one.
      p = this.capture(host)
        .catch(() => {})
        .finally(() => {
          this.takenAt.set(host.id, Date.now());
          this.inflight.delete(host.id);
        });
      this.inflight.set(host.id, p);
    }
    return p;
  }

  private async capture(host: HostMonitor): Promise<void> {
    // What tmux shows of each window: all its panes, or only the zoomed one.
    const targets = new Set<string>();
    for (const s of host.snapshot.sessions) {
      for (const w of s.windows) for (const p of w.zoomed ? w.panes.filter((x) => x.active) : w.panes) targets.add(p.id);
    }
    const args: string[] = [];
    for (const id of targets) {
      if (args.length) args.push(';');
      args.push(
        'display-message', '-p', '-t', id, `${this.mark} #{pane_id} #{pane_left} #{pane_top} #{pane_width} #{pane_height} #{window_width} #{window_height}`,
        ';', 'capture-pane', '-p', '-e', '-t', id,
      );
    }
    const out = args.length ? await host.exec.run(args) : '';

    const prev = this.entries.get(host.id);
    const next = new Map<string, Entry>();
    let cur: { id: string; n: number[]; lines: string[] } | null = null;
    const flush = () => {
      if (!cur) return;
      const lines = cur.lines;
      while (lines.length && !lines[lines.length - 1]) lines.pop();
      const [left, top, width, height, cols, rows] = cur.n;
      const preview: PanePreview = { left, top, width, height, cols, rows, text: lines.join('\n') };
      const old = prev?.get(cur.id);
      const same = old && (Object.keys(preview) as (keyof PanePreview)[]).every((k) => old[k] === preview[k]);
      next.set(cur.id, { ...preview, rev: same ? old.rev : ++this.rev });
    };
    for (const line of out.split('\n')) {
      if (line.startsWith(`${this.mark} `)) {
        flush();
        const [, id, ...n] = line.split(' ');
        cur = { id, n: n.map(Number), lines: [] };
      } else cur?.lines.push(line);
    }
    flush();
    this.entries.set(host.id, next);
  }
}
