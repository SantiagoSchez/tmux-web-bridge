import { EventEmitter } from 'node:events';
import type { HostInfo, PaneInfo, PaneState, RateLimits, SessionInfo, WindowInfo } from '../../shared/types.js';
import type { Config, HostConfig } from './config.js';
import { TmuxError, TmuxExec } from './exec.js';

/** Prefix of the grouped sessions opened by web terminals (hidden from the tree). */
export const WEB_SESSION_PREFIX = '_tw-';

/**
 * How long a host that stops answering keeps showing what it had open. Past a short
 * blip it is no longer known: a machine switched off would keep spaces that cannot be
 * opened or closed.
 */
const OFFLINE_GRACE_MS = 60_000;

const SEP = '\x1f';
const FIELDS = [
  'session_id', 'session_name', '@space_num', '@space_icon', 'session_attached', 'session_created',
  'window_id', 'window_index', 'window_name', 'window_active', '@win_icon', '@win_state', '@name_pinned',
  'window_bell_flag', 'window_activity_flag', 'window_zoomed_flag',
  'pane_id', 'pane_index', 'pane_active', 'pane_current_command', 'pane_current_path', 'pane_title',
  '@pane_icon', 'pane_width', 'pane_height', 'pane_dead', 'pane_in_mode',
  // Global option, the same on every row: Claude's usage limits from the statusline.
  '@claude_rate_limits',
] as const;
const FORMAT = FIELDS.map((f) => `#{${f}}`).join(SEP);

const ICON_STATES: Record<string, PaneState> = {
  '🙋': 'question',
  '💬': 'attention',
  '✅': 'done',
  '🔨': 'busy',
  '🤖': 'claude',
  '📡': 'ssh',
};
const STATES = new Set<string>(Object.values(ICON_STATES));

// Claude Code's process title is its version (2.1.301): show it as what it is.
function commandName(cmd: string): string {
  return /^\d+\.\d+\.\d+/.test(cmd) ? 'claude' : cmd;
}

function stateOf(icon: string, explicit = ''): PaneState | null {
  if (STATES.has(explicit)) return explicit as PaneState;
  return ICON_STATES[icon] ?? null;
}

/** Context of a pane, for notifications. */
export interface PaneContext {
  host: HostMonitor;
  session: SessionInfo;
  window: WindowInfo;
  pane: PaneInfo;
}

export interface PaneTransition extends PaneContext {
  from: PaneState | null;
  to: PaneState | null;
}

interface WebSessionRow {
  name: string;
  attached: number;
  created: number;
}

/** "pct5h reset5h pct7d reset7d updated" (see the statusline snippet in the README). */
function parseLimits(raw: string): RateLimits | null {
  const n = raw.trim().split(/\s+/).map(Number);
  if (n.length < 5 || n.some((x) => !Number.isFinite(x))) return null;
  return { fiveHour: { pct: n[0], resetsAt: n[1] }, sevenDay: { pct: n[2], resetsAt: n[3] }, updatedAt: n[4] };
}

function parse(output: string): { sessions: SessionInfo[]; webSessions: WebSessionRow[]; limits: RateLimits | null } {
  let limits: RateLimits | null = null;
  const sessions = new Map<string, SessionInfo>();
  const windows = new Map<string, WindowInfo>();
  const webSessions = new Map<string, WebSessionRow>();
  for (const line of output.split('\n')) {
    if (!line) continue;
    const v = line.split(SEP);
    if (v.length < FIELDS.length) continue;
    const r = Object.fromEntries(FIELDS.map((f, i) => [f, v[i]])) as Record<(typeof FIELDS)[number], string>;
    limits ??= parseLimits(r['@claude_rate_limits']);

    if (r.session_name.startsWith(WEB_SESSION_PREFIX)) {
      webSessions.set(r.session_name, { name: r.session_name, attached: Number(r.session_attached), created: Number(r.session_created) });
      continue;
    }

    let session = sessions.get(r.session_id);
    if (!session) {
      session = {
        id: r.session_id,
        name: r.session_name,
        num: r['@space_num'] ? Number(r['@space_num']) : null,
        icon: r['@space_icon'],
        attached: Number(r.session_attached),
        windows: [],
      };
      sessions.set(r.session_id, session);
    }
    // A window linked into several sessions is listed once per session.
    const wkey = `${r.session_id}/${r.window_id}`;
    let win = windows.get(wkey);
    if (!win) {
      win = {
        id: r.window_id,
        index: Number(r.window_index),
        name: r.window_name,
        active: r.window_active === '1',
        icon: r['@win_icon'],
        state: stateOf(r['@win_icon'], r['@win_state']),
        pinned: r['@name_pinned'] === '1',
        bell: r.window_bell_flag === '1',
        activity: r.window_activity_flag === '1',
        zoomed: r.window_zoomed_flag === '1',
        panes: [],
      };
      windows.set(wkey, win);
      session.windows.push(win);
    }
    win.panes.push({
      id: r.pane_id,
      index: Number(r.pane_index),
      active: r.pane_active === '1',
      command: commandName(r.pane_current_command),
      path: r.pane_current_path,
      title: r.pane_title,
      icon: r['@pane_icon'],
      state: stateOf(r['@pane_icon']),
      width: Number(r.pane_width),
      height: Number(r.pane_height),
      dead: r.pane_dead === '1',
      inMode: r.pane_in_mode === '1',
    });
  }
  const list = [...sessions.values()];
  // Same order as the status bar: space number (creation order), then session id.
  list.sort((a, b) => (a.num ?? 1e9) - (b.num ?? 1e9) || Number(a.id.slice(1)) - Number(b.id.slice(1)));
  for (const s of list) {
    s.windows.sort((a, b) => a.index - b.index);
    for (const w of s.windows) w.panes.sort((a, b) => a.index - b.index);
  }
  return { sessions: list, webSessions: [...webSessions.values()], limits };
}

/**
 * Keeps an up-to-date tree of one host's tmux by polling `list-panes -a`
 * (cheap over a multiplexed SSH connection) and reports changes.
 *
 * Events: 'change' (HostInfo), 'transition' (PaneTransition).
 */
export class HostMonitor extends EventEmitter {
  readonly exec: TmuxExec;
  readonly id: string;
  readonly name: string;
  private info: HostInfo;
  private lastJson = '';
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private failures = 0;
  private offlineSince: number | null = null;
  private polling: Promise<void> | null = null;
  private prefixLoaded = false;
  /** Web terminal sessions with a live pty on this hub (never reaped). */
  readonly liveWebSessions = new Set<string>();

  constructor(
    readonly hostConfig: HostConfig,
    private readonly config: Config,
  ) {
    super();
    this.id = hostConfig.id;
    this.name = hostConfig.name;
    this.exec = new TmuxExec(hostConfig, config);
    this.info = { id: this.id, name: this.name, status: 'connecting', sessions: [], projects: hostConfig.projects ? true : undefined, reboot: hostConfig.local ? undefined : true };
  }

  get snapshot(): HostInfo {
    return this.info;
  }

  start(): void {
    this.stopped = false;
    void this.tick();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  /** Polls right away (after an action) instead of waiting for the next tick. */
  refresh(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    return this.tick();
  }

  private tick(): Promise<void> {
    if (this.polling) return this.polling;
    this.polling = this.poll().finally(() => {
      this.polling = null;
      if (this.stopped) return;
      // Back off on errors: 1s, 2s, 4s... up to 30s.
      const delay = this.failures === 0 ? this.config.pollIntervalMs : Math.min(30_000, 1000 * 2 ** Math.min(this.failures - 1, 5));
      this.timer = setTimeout(() => void this.tick(), delay);
    });
    return this.polling;
  }

  private async poll(): Promise<void> {
    let sessions: SessionInfo[] = [];
    let webSessions: WebSessionRow[] = [];
    let limits: RateLimits | null = null;
    try {
      const out = await this.exec.runFormat(['list-panes', '-a', '-F', FORMAT]);
      ({ sessions, webSessions, limits } = parse(out));
      if (!this.prefixLoaded) {
        const prefix = (await this.exec.run(['show-options', '-gv', 'prefix'])).trim();
        this.info = { ...this.info, prefix };
        this.prefixLoaded = true;
      }
    } catch (err) {
      if (!(err instanceof TmuxError && err.noServer)) {
        this.failures++;
        this.offlineSince ??= Date.now();
        const stale = Date.now() - this.offlineSince > OFFLINE_GRACE_MS;
        this.update({ ...this.info, status: 'error', error: (err as Error).message, sessions: stale ? [] : this.info.sessions });
        return;
      }
    }
    this.failures = 0;
    this.offlineSince = null;
    const prev = this.info;
    this.update({ id: this.id, name: this.name, status: 'ok', sessions, prefix: this.info.prefix, limits });
    this.detectTransitions(prev, this.info);
    void this.reapWebSessions(webSessions);
  }

  private update(next: HostInfo): void {
    if (this.hostConfig.projects) next = { ...next, projects: true };
    if (!this.hostConfig.local) next = { ...next, reboot: true };
    this.info = next;
    const json = JSON.stringify(next);
    if (json === this.lastJson) return;
    this.lastJson = json;
    this.emit('change', next);
  }

  private detectTransitions(prev: HostInfo, next: HostInfo): void {
    if (prev.status !== 'ok') return; // First successful poll: nothing to compare with.
    const before = new Map<string, PaneState | null>();
    for (const s of prev.sessions) for (const w of s.windows) for (const p of w.panes) before.set(p.id, p.state);
    const seen = new Set<string>();
    for (const session of next.sessions) {
      for (const window of session.windows) {
        for (const pane of window.panes) {
          if (seen.has(pane.id)) continue;
          seen.add(pane.id);
          const from = before.has(pane.id) ? before.get(pane.id)! : null;
          if (from !== pane.state) this.emit('transition', { host: this, session, window, pane, from, to: pane.state } satisfies PaneTransition);
        }
      }
    }
  }

  /** Kills web terminal sessions left behind (hub restarted, tmux-resurrect restore...). */
  private async reapWebSessions(rows: WebSessionRow[]): Promise<void> {
    const now = Date.now() / 1000;
    for (const row of rows) {
      if (row.attached > 0 || this.liveWebSessions.has(row.name) || now - row.created < 30) continue;
      await this.exec.run(['kill-session', '-t', `=${row.name}`]).catch(() => {});
    }
  }

  findPane(paneId: string): PaneContext | null {
    for (const session of this.info.sessions)
      for (const window of session.windows)
        for (const pane of window.panes) if (pane.id === paneId) return { host: this, session, window, pane };
    return null;
  }

  findWindow(windowId: string): { session: SessionInfo; window: WindowInfo } | null {
    for (const session of this.info.sessions) for (const window of session.windows) if (window.id === windowId) return { session, window };
    return null;
  }
}
