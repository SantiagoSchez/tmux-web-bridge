// Types shared by the hub (server/) and the web app (web/). Type-only: both sides
// import them with `import type`, so nothing here exists at runtime.

/** Claude/tmux pane states set by host-kit/tmux-window-title.sh (most urgent first). */
export type PaneState = 'question' | 'attention' | 'done' | 'busy' | 'claude' | 'ssh';

export interface PaneInfo {
  id: string; // %12
  index: number;
  active: boolean;
  command: string;
  path: string;
  title: string;
  icon: string; // @pane_icon
  state: PaneState | null;
  width: number;
  height: number;
  dead: boolean;
  inMode: boolean;
  /** Email of the Claude account of the Claude Code in it (@claude_account, from its statusline). */
  account?: string;
  /** Session id of the Claude Code in it (@claude_session, from host-kit/tmux-window-title.sh), to resume it. */
  claudeSession?: string;
}

export interface WindowInfo {
  id: string; // @3
  index: number;
  name: string;
  active: boolean;
  icon: string; // @win_icon
  state: PaneState | null; // @win_state
  pinned: boolean; // @name_pinned
  bell: boolean;
  activity: boolean;
  zoomed: boolean;
  panes: PaneInfo[];
}

export interface SessionInfo {
  id: string; // $1
  name: string;
  num: number | null; // @space_num
  icon: string; // @space_icon
  attached: number;
  windows: WindowInfo[];
}

export type HostStatus = 'connecting' | 'ok' | 'error';

/** Claude usage limits of the account (5-hour and weekly windows), as Claude Code reports them. */
export interface RateLimits {
  fiveHour: { pct: number; resetsAt: number }; // resetsAt: epoch seconds
  sevenDay: { pct: number; resetsAt: number };
  /** When a statusline on that host last saw them (epoch seconds). */
  updatedAt: number;
  /** Email of the Claude account they belong to; missing from older statuslines. */
  account?: string;
}

/** One reading of the usage limits, kept by the hub to forecast when they run out. */
export interface UsageSample {
  account?: string;
  t: number; // epoch seconds
  five: number;
  fiveReset: number;
  seven: number;
  sevenReset: number;
}

export interface HostInfo {
  id: string;
  name: string;
  status: HostStatus;
  error?: string;
  sessions: SessionInfo[];
  /** tmux prefix key as tmux names it (C-a, C-b...). */
  prefix?: string;
  /** Published by the Claude Code statusline on that host (@claude_rate_limits), one per account. */
  limits?: RateLimits[];
  /** "Nuevo space" opens a project of its projects folder, like the `c` shell function. */
  projects?: boolean;
  /** Its menu offers to reboot it (SSH hosts; never the hub's own). */
  reboot?: boolean;
  /** Version of its host-kit (@twb_kit_version, set by the kit's tmux.conf); missing before 1.0.0. */
  kit?: string;
}

/** Settings of the whole hub (every device sees and changes the same ones). */
export interface HubSettings {
  /**
   * The 5h/7d limits at the end of the Claude Code status line on every machine. Off
   * when tmux's own bar shows them: the hub sets @claude_limits_in_status=1 there.
   */
  limitsInStatusLine: boolean;
  /**
   * Dictation: the hub transcribes what you say (Parakeet) and types it into the pane.
   * Off by default: the speech model takes about 1 GB of the hub's memory.
   */
  dictation: boolean;
  /** "llm": a local model (llama-server) cleans the transcript up; "none": typed as heard. */
  dictationCleanup: 'llm' | 'none';
  /** Terms the speech model tends to mishear (one per line), handed to the cleanup. */
  dictationGlossary: string;
  /** Seconds the cleanup may take before the transcript is typed as heard (one of DICTATION_TIMEOUTS). */
  dictationTimeout: number;
}

/** What the hub's dictation can do right now. */
export interface DictationInfo {
  /** The speech model: off (setting off), being downloaded or loaded, ready, or failed. */
  state: 'off' | 'downloading' | 'loading' | 'ready' | 'error';
  /** Download progress, 0 to 1. */
  progress?: number;
  error?: string;
  /** The cleanup model: not configured, answering, or not answering. */
  llm: 'unset' | 'ok' | 'down';
  /** Its name, as llama-server reports it. */
  llmModel?: string;
}

/** Answer of POST /api/dictate. */
export interface DictateResult {
  /** What was typed into the pane ("" when nothing was heard). */
  text: string;
  /** Why the cleanup was skipped and the transcript typed as heard. */
  fallback?: 'timeout' | 'error' | 'unavailable';
}

/** The daily check for a new release of twb on GitHub, set for the whole hub. */
export interface UpdateInfo {
  enabled: boolean;
  /** Version of the running hub. */
  current: string;
  /** Last published release, as of the last check. */
  latest: { version: string; url: string } | null;
  /** Release whose notice was closed: it does not come back until a newer one. */
  dismissed: string | null;
  /** The release of the running version (missing for a version never released, or with the check off). */
  released: { date: string; url: string } | null;
}

/** A host's projects (folders of its projects dir) and `c` shortcuts. */
export interface ProjectList {
  dir: string;
  projects: string[];
  shortcuts: { name: string; path: string }[];
}

/** A pane's screen for the windows grid, as `capture-pane -e` prints it (text with SGR colours). */
export interface PanePreview {
  /** Place and size of the pane in its window, in cells. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** Size of the whole window, in cells. */
  cols: number;
  rows: number;
  text: string;
}

/**
 * GET /api/previews?since=<rev>: the panes whose screen changed after that revision
 * (keyed "host:%pane"), and the keys of every pane with a preview, to drop the rest.
 */
export interface PreviewsResponse {
  rev: number;
  panes: Record<string, PanePreview>;
  alive: string[];
}

export interface ViewInfo {
  host: string;
  session?: string;
  window?: string;
  pane?: string;
}

export interface ConnectionInfo {
  id: string;
  login?: string;
  userName?: string;
  device?: string;
  os?: string;
  ip?: string;
  userAgent?: string;
  connectedAt: number;
  visible: boolean;
  /** You are using that device (it reports system-wide activity): no pushes are sent. */
  present?: boolean;
  terminals: number;
  view?: ViewInfo;
}

export type ActionOp =
  | { op: 'newSession'; name?: string }
  | { op: 'listProjects' }
  | { op: 'openProject'; name: string; create?: boolean }
  | { op: 'renameSession'; session: string; name: string }
  | { op: 'killSession'; session: string }
  | { op: 'newWindow'; session: string; name?: string }
  | { op: 'renameWindow'; window: string; name: string }
  | { op: 'killWindow'; window: string }
  | { op: 'splitPane'; pane: string; direction: 'h' | 'v' }
  | { op: 'killPane'; pane: string }
  | { op: 'selectPane'; pane: string }
  | { op: 'zoomPane'; pane: string }
  /** Back to the end of the output: out of copy mode, or Ctrl+End to a full-screen program (Claude Code). */
  | { op: 'scrollToEnd'; pane: string }
  | { op: 'reloadWindow'; window: string }
  | { op: 'reboot' }
  /** Moves the host's kit to the last release the hub knows of (the hub picks the version). */
  | { op: 'updateKit' };

/** Messages from the browser to the hub over /ws. */
export type ClientMessage =
  | { t: 'hello'; visible: boolean }
  | { t: 'view'; view: ViewInfo | null; visible: boolean }
  | { t: 'presence'; present: boolean }
  /** The machines' order in the list (host ids), kept by the hub for every device. */
  | { t: 'hostOrder'; hosts: string[] }
  | { t: 'updateCheck'; enabled: boolean }
  | { t: 'updateDismiss'; version: string }
  | { t: 'settings'; settings: Partial<HubSettings> }
  | ({ t: 'action'; id: number; host: string } & ActionOp);

/** Messages from the hub to the browser over /ws. */
export type ServerMessage =
  | { t: 'welcome'; clientId: string; vapidPublicKey: string | null }
  | { t: 'tree'; hosts: HostInfo[] }
  | { t: 'host'; host: HostInfo }
  | { t: 'hostOrder'; hosts: string[] }
  /** Usage limit readings of the last hours (on connect and on each new one). */
  | { t: 'usage'; samples: UsageSample[] }
  | { t: 'connections'; list: ConnectionInfo[] }
  | { t: 'updates'; info: UpdateInfo }
  | { t: 'settings'; settings: HubSettings }
  | { t: 'dictation'; info: DictationInfo }
  | { t: 'result'; id: number; ok: boolean; error?: string; data?: unknown };

/** Body of POST /api/notify, sent by tmux-window-title.sh on each host. */
export interface NotifyRequest {
  host: string;
  pane: string;
  state: 'question' | 'attention' | 'done';
  title?: string;
  message?: string;
  viewed?: boolean;
}

/** Payload of a Web Push message, read by web/public/sw.js. */
export interface PushPayload {
  title: string;
  body: string;
  tag: string;
  url: string;
  /** Answer buttons for a Claude choice menu: the service worker posts them to /api/respond. */
  actions?: { action: string; title: string }[];
  respond?: { host: string; pane: string; fingerprint: string };
}

/** Body of POST /api/respond: pick an option of a choice menu from a notification. */
export interface RespondRequest {
  host: string;
  pane: string;
  key: string;
  fingerprint: string;
}
