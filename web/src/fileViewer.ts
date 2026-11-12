import { signal } from '@preact/signals';
import type { GitChange, GitChanges, GitDiffMode } from '../../shared/types';

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
  /** mode: the one asked for; missing, the hub picks (the whole branch on any branch but the main one). */
  | { kind: 'changes'; mode?: GitDiffMode }
  | { kind: 'diff'; changes: GitChanges; file: GitChange };

/** What the viewer shows, and from where; null when closed. Each screen is a layer of the back button. */
export const fileViewer = signal<{ origin: FileOrigin; stack: FileScreen[] } | null>(null);

export function pushFileScreen(screen: FileScreen): void {
  const v = fileViewer.value;
  if (v) fileViewer.value = { ...v, stack: [...v.stack, screen] };
}

/** Back one screen, or closed from the first one (its «Atrás», and the phone's back button). */
export function fileViewerBack(): void {
  const v = fileViewer.value;
  if (v) fileViewer.value = v.stack.length > 1 ? { ...v, stack: v.stack.slice(0, -1) } : null;
}
