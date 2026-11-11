import { signal, effect } from '@preact/signals';

export interface Prefs {
  termFontSize: number;
  collapsedHosts: string[];
  /** "host:session name" of the spaces folded in the list. */
  collapsedSessions: string[];
  /** No pushes to any device while you are using this one (Idle Detection). */
  silenceWhilePresent: boolean;
  /** Light or dark, or whatever the device uses. */
  theme: 'dark' | 'light' | 'system';
  /** "Abrir proyecto" and "Recargar" start claude with --dangerously-skip-permissions instead of auto mode. */
  skipPermissions: boolean;
  /** The list of spaces: with each window's folder and git worktree or branch, or one short line per row. */
  listView: 'detailed' | 'compact';
}

const DEFAULTS: Prefs = { termFontSize: 13, collapsedHosts: [], collapsedSessions: [], silenceWhilePresent: false, theme: 'dark', skipPermissions: false, listView: 'detailed' };
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

export const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
