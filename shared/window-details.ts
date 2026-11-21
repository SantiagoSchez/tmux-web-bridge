// What the panel tells about a window or a space when the mouse rests on it: every detail
// the list cuts with «…», whole. Plain data, so the panel only lays it out.

import { changeFacts } from './change-progress.js';
import { homePath } from './folders.js';
import type { PaneState, SessionInfo, WindowInfo } from './types.js';

/** The name of each Claude/tmux state, as the panel writes it. */
export const STATE_LABEL: Record<PaneState, string> = {
  question: 'Pregunta',
  attention: 'Necesita atención',
  done: 'Terminado',
  busy: 'Trabajando',
  claude: 'Claude',
  ssh: 'SSH',
};

export interface PaneDetails {
  index: number;
  /** The window's active pane; only said when the window has several. */
  active: boolean;
  /** The pane the details were asked for (the rail's), to set it apart. */
  marked: boolean;
  command: string;
  /** Its git worktree, or else its branch; missing outside a repository. */
  place?: { kind: 'worktree' | 'branch'; name: string };
  /** Its folder, with the machine's home written ~. */
  path?: string;
  /** The Claude account of the Claude Code in it. */
  account?: string;
  /** The active OpenSpec changes of its repository: each one's full name and what is known of it («7/23», «PR #74»…). */
  changes?: { name: string; facts: string[] }[];
}

export interface WindowDetails {
  name: string;
  /** The machine, when the panel shows several. */
  host?: string;
  /** Its most urgent state and since when the pane in that state has had it (epoch ms), when known. */
  state?: { icon: string; label: string; since?: number };
  panes: PaneDetails[];
}

/**
 * A window's details: its name, state and machine, and for each pane its command, worktree
 * or branch, folder and Claude account. Details it does not have are left out, not empty.
 */
export function windowDetails(window: WindowInfo, opts: { home: string; hostName?: string; mark?: string }): WindowDetails {
  const several = window.panes.length > 1;
  const out: WindowDetails = { name: window.name, panes: [] };
  if (opts.hostName) out.host = opts.hostName;
  if (window.state) {
    const since = window.panes.find((p) => p.state === window.state)?.since;
    out.state = { icon: window.icon, label: STATE_LABEL[window.state], ...(since ? { since } : {}) };
  }
  for (const p of window.panes) {
    const d: PaneDetails = { index: p.index, active: several && p.active, marked: p.id === opts.mark, command: p.command };
    if (p.git) d.place = p.git.worktree !== undefined ? { kind: 'worktree', name: p.git.worktree } : { kind: 'branch', name: p.git.branch };
    if (p.path) d.path = homePath(p.path, opts.home);
    if (p.account) d.account = p.account;
    if (p.changes?.length) d.changes = p.changes.map((c) => ({ name: c.name, facts: changeFacts(c) }));
    out.panes.push(d);
  }
  return out;
}

/** A space's details: its full name and how many windows it has. */
export function spaceDetails(session: SessionInfo): { name: string; windows: number } {
  return { name: session.name, windows: session.windows.length };
}
