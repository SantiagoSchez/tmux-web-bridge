// Types shared by the hub (server/) and the web app (web/). Type-only: both sides
// import them with `import type`, so nothing here exists at runtime.

import type { DictationButton } from './dictation.js';
import type { KeybarButton } from './keybar.js';
import type { Schedule } from './schedule.js';

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
  /** The git worktree or branch of its folder, when it is in a repo (read by the hub every few seconds). */
  git?: PaneGit;
  /** When it got its current state (epoch ms), as the hub saw it; missing when it had it before the hub started. */
  since?: number;
}

/** A linked worktree (its folder's name) or, in the repo's own folder, the branch checked out. */
export type PaneGit = { worktree: string; branch?: undefined } | { branch: string; worktree?: undefined };

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

/** One usage window of a Claude account: how much of it is used and when it starts over. */
export interface UsageWindow {
  pct: number;
  resetsAt: number; // epoch seconds; 0 when unknown
}

/** A Claude account's usage as the hub read it from Anthropic (api/oauth/usage). */
export interface AccountUsage {
  /** When it was read (epoch seconds). */
  t: number;
  fiveHour?: UsageWindow;
  sevenDay?: UsageWindow;
  /** Weekly limits of a single model (Fable...), by its name. */
  models: (UsageWindow & { name: string })[];
}

/** A Claude account the hub keeps logins of, to see its usage and switch machines to it. */
export interface ClaudeAccount {
  /** accountUuid:organizationUuid: one email may belong to several organizations. */
  id: string;
  alias: string;
  email: string;
  /** Its organization's name, if it has one worth showing. */
  org?: string;
  /** "Max 5x", "Team", "Pro"... */
  plan?: string;
  usage?: AccountUsage;
  /** Why its usage could not be read last time, if it could not. */
  usageError?: string;
  /** Machines whose Claude Code is logged in with it right now (host ids). */
  activeOn: string[];
  /** Logins the hub holds that no machine is using: each one can go to a machine without logging in again. */
  spare: number;
  /** Every login the hub had of it stopped working: it needs a new one. */
  needsLogin: boolean;
}

/** Everything about the Claude accounts the panel shows. */
export interface AccountsInfo {
  list: ClaudeAccount[];
  /** The account each machine's Claude Code is logged in with (id), as last seen; null when logged out or unknown. */
  hosts: Record<string, string | null>;
  /** Machines whose account is being switched right now. */
  switching: string[];
}

/** Account actions, from the panel. */
export type AccountOp =
  /** Starts a login: the URL to open, and the state that ties its code to it. */
  | { op: 'loginStart' }
  /**
   * Ends it with the code the login page shows; `host`: activate it there right after,
   * but only if it is `account` (when given): a login with another account is only kept.
   */
  | { op: 'loginFinish'; state: string; code: string; alias?: string; host?: string; account?: string }
  /** Makes `account` the one the machine's Claude Code uses, without restarting it. */
  | { op: 'switch'; account: string; host: string }
  | { op: 'rename'; account: string; alias: string }
  | { op: 'remove'; account: string };

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
  /** Its menu offers to reboot it (SSH hosts; never the hub's own). */
  reboot?: boolean;
  /** Version of its host-kit (@twb_kit_version, set by the kit's tmux.conf); missing before 1.0.0. */
  kit?: string;
  /** Its home folder, to show the panes' folders under ~. */
  home?: string;
}

/** Settings of the whole hub (every device sees and changes the same ones). */
export interface HubSettings {
  /**
   * The 5h/7d limits at the end of the Claude Code status line on every machine. Off
   * when tmux's own bar shows them: the hub sets @claude_limits_in_status=1 there.
   */
  limitsInStatusLine: boolean;
  /** A space with a single window is one row in the list (and one item in the palette and menus). */
  soloSpaces: boolean;
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
  /** The 🎤 button: hold to talk, or tap to start and tap again to send. */
  dictationButton: DictationButton;
  /** Starts dictating (held: until released; pressed: until pressed again). See parseShortcut. */
  dictationShortcut: string;
  /** The key bar under the terminal on touch screens, in order. See shared/keybar.ts. */
  keybar: KeybarButton[];
  /** The size of the key bar's buttons, in % (see KEYBAR_SCALE_* in shared/keybar.ts). */
  keybarScale: number;
  /**
   * The folders «Nuevo space» offers, by host id. A patch replaces the list of each
   * host it names (an empty list removes it) and keeps the others.
   */
  folders: Record<string, SavedFolder[]>;
  /**
   * What is typed into a space opened from a folder, by host id (missing: claude,
   * which gets the permission mode chosen; empty: only the shell). Patched like folders.
   */
  commands: Record<string, string>;
  /**
   * Machines that keep the Trello extension up to date with their kit (install.sh
   * --trello-extension), by host id: the folder it is in there, for «Cargar descomprimida».
   * Only the hub changes it, after running install.sh on the machine (op trelloExtension).
   */
  trelloExtension: Record<string, string>;
  /** The prompt of a task launched on a Trello card (panel and extension), with {url}, {name}, {shortLink} and {board}. */
  trelloPromptTemplate: string;
}

/** A folder of a machine added in the panel: «Nuevo space» opens a space there. */
export interface SavedFolder {
  name: string;
  /** On that machine: absolute, or under ~ (written ~/…). */
  path: string;
  /** Offers each folder inside (read every time, so always current) instead of this one. */
  subfolders?: boolean;
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

/** The token of the Trello extension (Settings › Trello): whether there is one, and since when. */
export interface ExtTokenInfo {
  active: boolean;
  /** Epoch milliseconds. */
  createdAt?: number;
}

/** Where the Trello extension can launch a task on one machine (GET /api/ext/targets). */
export interface ExtHostTargets {
  id: string;
  name: string;
  status: HostStatus;
  error?: string;
  /** Its open spaces (not the panel's own terminals). */
  spaces: { id: string; name: string; windows: number }[];
  /** Its folders of «Nuevo space», as listProjects reads them; missing when they could not be read. */
  folders?: ProjectList['folders'];
  foldersError?: string;
}

export interface ExtTargets {
  hosts: ExtHostTargets[];
}

/** An open space (its id), or an added folder (or `sub`, one inside a folder with subfolders). */
export type ExtLaunchTarget = { session: string } | { folder: string; sub?: string };

/**
 * POST /api/ext/launch: a new window in the target's space (the space is made first for a
 * folder without one) running claude with the prompt.
 */
export interface ExtLaunchRequest {
  host: string;
  target: ExtLaunchTarget;
  prompt: string;
  /** The window's name (pinned); the worktree's, or the kit's automatic title, when missing. */
  name?: string;
  skipPermissions?: boolean;
  /** Start claude in a new git worktree of this name (`claude --worktree`); the prompt may be left out then. */
  worktree?: string;  /**
   * The Trello card (its id) the task is about: once launched, the hub moves it to its
   * board's Doing list and comments on it, with the Trello account of Settings › Trello.
   */
  card?: string;
}

export interface ExtLaunchResult {
  host: string;
  hostName: string;
  session: string;
  /** The space's name. */
  space: string;
  window: string;
  /** The window's name as tmux took it. */
  windowName: string;
  pane: string;
  /** The space was made for this task. */
  createdSpace: boolean;
  /** What happened to the card of the request, if it had one. */
  trello?: TrelloAfterLaunch;
}

/** A Trello card as a launch needs it. */
export interface TrelloCard {
  id: string;
  name: string;
  /** https://trello.com/c/<shortLink> */
  url: string;
  shortLink: string;
  /** Its number on the board. */
  idShort: number;
  idList: string;
  board: { id: string; name: string };
}

/** GET /api/ext/card/:id and /api/trello/card/:id: a card, and the prompt template of Settings › Trello. */
export interface TrelloCardContext {
  card: TrelloCard;
  promptTemplate: string;
}

export interface TrelloBoard {
  id: string;
  name: string;
}

/** An open list of a board with its open cards (GET /api/trello/boards/:id). */
export interface TrelloList {
  id: string;
  name: string;
  cards: { id: string; name: string; idShort: number; url: string; labels: { name: string; color: string | null }[] }[];
}

/** Trello in Settings › Trello: whether the hub has an account, and whose. */
export interface TrelloInfo {
  configured: boolean;
  /** «Full Name (@username)», when it answered. */
  member?: string;
  /** Why it did not answer. */
  error?: string;
}

/** After a task on a card: where the card went, and what went wrong (the task was launched anyway). */
export interface TrelloAfterLaunch {
  /** The list it moved to, if it moved (or was there already). */
  movedTo?: string;
  commented: boolean;
  warnings: string[];
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

/**
 * A host's folders for «Nuevo space», as they are now: missing, the folder is not
 * there (moved, deleted, or a disk not mounted); children, the folders inside one
 * with subfolders (hidden ones left out).
 */
export interface ProjectList {
  folders: (SavedFolder & { missing: boolean; children: string[] })[];
  /** The host's home folder, to show the paths under ~ in full. */
  home: string;
}

/** A folder of a host, for the folder picker: where it is and the folders inside. */
export interface DirListing {
  /** Absolute, or ~/… under the home folder. */
  path: string;
  /** null at the root. */
  parent: string | null;
  /** Names of the folders inside, hidden ones (leading '.') included. */
  dirs: string[];
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
  /**
   * Opens a space in an added folder (its path), or in `sub`, a folder inside one with
   * subfolders, created first with `create`. An open space of that name is reused.
   */
  | { op: 'openProject'; folder: string; sub?: string; create?: boolean; skipPermissions?: boolean }
  /**
   * Makes the folder `name` inside `parent` and opens a space there: one more inside a
   * folder with subfolders, or, anywhere else, a new one added to the host's folders.
   * With `subfolders` (not inside a folder with subfolders) it is added as one of those,
   * and no space opens: it offers the folders made inside it.
   */
  | { op: 'createFolder'; parent: string; name: string; subfolders?: boolean; skipPermissions?: boolean }
  /** A task, as the Trello extension launches it (ExtLaunchRequest without `host`): answers an ExtLaunchResult. */
  | ({ op: 'launchTask' } & Omit<ExtLaunchRequest, 'host' | 'prompt'> & { prompt?: string })
  /** Whether the machine's kit downloads the Trello extension of its release (and keeps it up to date). */
  | { op: 'trelloExtension'; on: boolean }
  /** The folders inside one, for the folder picker. */
  | { op: 'listDirs'; path: string }
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
  /** One page through the output: copy mode's page-up/down, or Page Up/Down to a full-screen program (Claude Code). */
  | { op: 'page'; pane: string; dir: 'up' | 'down' }
  | { op: 'reloadWindow'; window: string; skipPermissions?: boolean }
  | { op: 'reboot' }
  /** Moves the host's kit to the last release the hub knows of (the hub picks the version). */
  | { op: 'updateKit' };

/** Messages from the browser to the hub over /ws. */
export type ClientMessage =
  | { t: 'hello'; visible: boolean }
  /** Is the socket still alive? (the app came back to the front, or the network changed) */
  | { t: 'ping' }
  | { t: 'view'; view: ViewInfo | null; visible: boolean }
  | { t: 'presence'; present: boolean }
  /** The machines' order in the list (host ids), kept by the hub for every device. */
  | { t: 'hostOrder'; hosts: string[] }
  | { t: 'updateCheck'; enabled: boolean }
  | { t: 'updateDismiss'; version: string }
  | { t: 'settings'; settings: Partial<HubSettings> }
  | ({ t: 'action'; id: number; host: string } & ActionOp)
  | ({ t: 'account'; id: number } & AccountOp);

/** Messages from the hub to the browser over /ws. */
export type ServerMessage =
  | { t: 'welcome'; clientId: string; vapidPublicKey: string | null }
  | { t: 'pong' }
  | { t: 'tree'; hosts: HostInfo[] }
  | { t: 'host'; host: HostInfo }
  | { t: 'hostOrder'; hosts: string[] }
  /** Usage limit readings of the last hours (on connect and on each new one). */
  | { t: 'usage'; samples: UsageSample[] }
  | { t: 'connections'; list: ConnectionInfo[] }
  | { t: 'updates'; info: UpdateInfo }
  | { t: 'settings'; settings: HubSettings }
  | { t: 'dictation'; info: DictationInfo }
  | { t: 'accounts'; info: AccountsInfo }
  /** The activity of the last days, newest first (on connect), and each new event. */
  | { t: 'activity'; events: ActivityEvent[] }
  | { t: 'activityAdd'; event: ActivityEvent }
  /** code: what kind of failure, when the panel can do something about it ('needsLogin'). */
  | { t: 'result'; id: number; ok: boolean; error?: string; code?: string; data?: unknown };

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

/** A prompt the hub launches on its own on a schedule (Settings › Automatizaciones). */
export interface Automation {
  id: string;
  name: string;
  enabled: boolean;
  host: string;
  /** An added folder (or `sub`, one inside a folder with subfolders): a new window in its space. */
  target: { folder: string; sub?: string };
  prompt: string;
  /** Each run in a new worktree, «<name>-<date>». */
  worktree: boolean;
  skipPermissions: boolean;
  schedule: Schedule;
}

/** One run of an automation. */
export interface AutomationRun {
  /** Epoch milliseconds. */
  at: number;
  /** launched; skipped: the previous run was still at it; error: it could not launch. */
  status: 'launched' | 'skipped' | 'error';
  /** Ran from «Ejecutar ahora». */
  manual?: boolean;
  message?: string;
  session?: string;
  window?: string;
  pane?: string;
  worktree?: string;
}

/** GET /api/automations: each one, with its next run and its last ones (newest first). */
export interface AutomationInfo extends Automation {
  /** Epoch milliseconds; null when disabled (or a cron that never matches). */
  nextRun: number | null;
  runs: AutomationRun[];
}

/**
 * What happened, for the panel's «Actividad»: a Claude asked, wanted permission or
 * finished (and how long it worked), a task was launched (from where), an automation
 * was skipped or failed.
 */
export interface ActivityEvent {
  id: number;
  /** Epoch milliseconds. */
  at: number;
  kind: 'question' | 'attention' | 'done' | 'launch' | 'skipped' | 'error';
  host: string;
  hostName: string;
  /** The space's name. */
  space?: string;
  window?: string;
  windowName?: string;
  pane?: string;
  /** done: how long it had been working (ms), when the hub saw it start. */
  worked?: number;
  /** launch: where the task came from. */
  source?: 'trello' | 'extension' | 'automation' | 'panel';
  /** launch: the worktree (or, from an automation, its name); skipped and error: why (windowName is the automation's name). */
  text?: string;
}
