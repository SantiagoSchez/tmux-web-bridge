// Which pane of a tmux window a cell of the panel's terminal belongs to. The terminal shows
// the whole window from its top left corner (the panel's tmux client has no status line),
// so a link in a split window belongs to the pane under it, not to the selected one.

import type { PaneInfo, WindowInfo } from './types.js';

/**
 * The pane at a cell (0-based column and row of the screen) of a terminal of cols × rows:
 * the active pane of a zoomed window, else the pane whose rectangle holds the cell.
 * Nothing on a border, or when the window does not fit (tmux then shows part of it, at an
 * offset the panel does not know).
 */
export function paneAt(window: WindowInfo, col: number, row: number, cols: number, rows: number): PaneInfo | undefined {
  const zoomed = window.zoomed ? window.panes.find((p) => p.active) : undefined;
  const shown = zoomed ? [zoomed] : window.panes;
  const width = Math.max(0, ...shown.map((p) => p.left + p.width));
  const height = Math.max(0, ...shown.map((p) => p.top + p.height));
  if (width > cols || height > rows) return undefined;
  return shown.find((p) => col >= p.left && col < p.left + p.width && row >= p.top && row < p.top + p.height);
}
