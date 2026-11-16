import { signal, effect } from '@preact/signals';

export interface Prefs {
  termFontSize: number;
  collapsedHosts: string[];
  /** "host:session name" of the spaces folded in the list. */
  collapsedSessions: string[];
  /** While you are using this device (Idle Detection), pushes go only here, and none while the app is on screen. */
  silenceWhilePresent: boolean;
  /** Light or dark, or whatever the device uses. */
  theme: 'dark' | 'light' | 'system';
  /** "Abrir proyecto" and "Recargar" start claude with --dangerously-skip-permissions instead of auto mode. */
  skipPermissions: boolean;
  /** The list of spaces: with each window's folder and git worktree or branch, or one short line per row. */
  listView: 'detailed' | 'compact';
  /** The Trello drawer: the board shown, the list shown on each board, and where tasks of each board went last. */
  trelloBoard: string;
  trelloLists: Record<string, string>;
  /** destination: the folder's key ('' for the space's own); space: the open space's ('' for the folder's), missing before there were both; base: the last base branch of a worktree. */
  trelloLaunch: Record<string, { host: string; destination: string; space?: string; base?: string }>;
  /** Tasks on Trello cards start in a new worktree. */
  trelloWorktree: boolean;
  /** The last base branch of «Nuevo worktree» per folder, keyed «host\tfolder\tsub». */
  worktreeBases: Record<string, string>;
  /** On a wide screen, the list folded into a narrow strip. */
  sidebarCollapsed: boolean;
  /** On a wide screen, the scratchpads folded into a narrow strip on the right. */
  scratchpadsCollapsed: boolean;
  /** The scratchpad shown (0 blue, 1 green, 2 orange). */
  scratchpad: number;
}

const DEFAULTS: Prefs = { termFontSize: 13, collapsedHosts: [], collapsedSessions: [], silenceWhilePresent: false, theme: 'dark', skipPermissions: false, listView: 'detailed',
  trelloBoard: '', trelloLists: {}, trelloLaunch: {}, trelloWorktree: false, worktreeBases: {}, sidebarCollapsed: false, scratchpadsCollapsed: false, scratchpad: 0 };
const KEY = 'tmux-web-bridge:prefs';

function load(): Prefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

export const prefs = signal<Prefs>(load());

effect(() => {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs.value));
  } catch {
    /* private mode: preferences last for this tab only */
  }
});

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  prefs.value = { ...prefs.value, [key]: value };
}

/** Wide screen with a fine pointer: sidebar layout. */
export const isDesktop = signal(matchMedia('(min-width: 900px)').matches);
matchMedia('(min-width: 900px)').addEventListener('change', (e) => (isDesktop.value = e.matches));

/** Folds the list into a strip on the left, or unfolds it (wide screens only). */
export function toggleSidebar(): void {
  setPref('sidebarCollapsed', !prefs.value.sidebarCollapsed);
}

/** How to fold the list from the keyboard, for the buttons' titles. */
export const SIDEBAR_KEY = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘B' : 'Ctrl+Shift+B';

/** Folds the scratchpads into a strip on the right, or unfolds them (wide screens only). */
export function toggleScratchpads(): void {
  setPref('scratchpadsCollapsed', !prefs.value.scratchpadsCollapsed);
}

/** How to fold the scratchpads from the keyboard, for the buttons' titles. */
export const SCRATCHPADS_KEY = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘.' : 'Ctrl+Shift+.';

export const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
