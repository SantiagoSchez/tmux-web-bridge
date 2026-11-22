import { signal } from '@preact/signals';
import type { GitChange, GitChanges } from '../../shared/types';

// What the file viewer shows (components/Files.tsx), apart from it: the back button
// (backButton.ts) counts and closes its screens, and must not import the components.

/** Where it was opened from: the window whose panes' folders relative paths start at. */
export interface FileOrigin {
  host: string;
  window?: string;
  pane?: string;
}

export type FileScreen =
  | { kind: 'file'; path: string; line?: number }
  /** The explorer, starting at `path` (relative ones from the origin's panes); where it moves stays in Explorer.tsx. */
  | { kind: 'dir'; path: string }
  /** What it compares with lives in Files.tsx, kept going into a diff and back. */
  | { kind: 'changes' }
  | { kind: 'diff'; changes: GitChanges; file: GitChange };

/**
 * What the viewer shows, and from where; null when closed. Each screen is a sheet over the
 * one below, which stays as it was, and a layer of the back button. `overDialog`: opened
 * from a dialog (a folder picker's «Abrir»), so it shows, and closes, above it; otherwise
 * it stays below the dialogs, so one opened meanwhile (a quick note) is seen.
 */
export const fileViewer = signal<{ origin: FileOrigin; stack: FileScreen[]; overDialog?: boolean } | null>(null);

export function pushFileScreen(screen: FileScreen): void {
  const v = fileViewer.value;
  if (v) fileViewer.value = { ...v, stack: [...v.stack, screen] };
}

/**
 * The screen `was` becomes another one (a file that turned out to be a folder), if it is
 * still the one on top: the back button still counts one.
 */
export function replaceFileScreen(was: FileScreen, screen: FileScreen): void {
  const v = fileViewer.value;
  if (v && v.stack[v.stack.length - 1] === was) fileViewer.value = { ...v, stack: [...v.stack.slice(0, -1), screen] };
}

/** Back one screen, or closed from the first one: every way of closing the sheet on top, and the phone's back button. */
export function fileViewerBack(): void {
  const v = fileViewer.value;
  if (v) fileViewer.value = v.stack.length > 1 ? { ...v, stack: v.stack.slice(0, -1) } : null;
}
