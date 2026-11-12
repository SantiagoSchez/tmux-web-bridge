// The extension's API in twb (/api/ext/*) is typed in shared/types.ts.
import type { ExtLaunchRequest, ExtTargets, TrelloCard } from '../../shared/types';

export type { ExtHostTargets, ExtLaunchRequest, ExtLaunchResult, ExtLaunchTarget, ExtTargets, TrelloCard as CardInfo } from '../../shared/types';

// ---------------------------------------------------------------- the extension's own

/**
 * What the options page sets (chrome.storage.local). Trello's key and token, and the
 * prompt template, live in the panel (Settings › Trello) since 1.18.
 */
export interface Settings {
  /** The twb panel, e.g. https://twb.example.com (no trailing slash). */
  hubUrl: string;
  hubToken: string;
}

/** The last choice of the launch dialog: per board, and the checkboxes for all. */
export interface Memory {
  boards: Record<string, { host: string; destination: string }>;
  skipPermissions: boolean;
  worktree: boolean;
}

/** Everything the dialog shows when it opens. */
export interface LaunchContext {
  card: TrelloCard;
  targets: ExtTargets;
  promptTemplate: string;
  remembered?: { host: string; destination: string };
  skipPermissions: boolean;
  worktree: boolean;
}

/** From the content script to the service worker. */
export type Request =
  | { type: 'context'; cardId: string }
  | { type: 'launch'; card: TrelloCard; req: ExtLaunchRequest; destination: string; worktree: boolean }
  | { type: 'openOptions' }
  /** A newer version waiting on disk (the kit downloaded it), or null. */
  | { type: 'update' }
  /** Its card in chrome://extensions, where it reloads. */
  | { type: 'openExtensions' };

export type Reply<T> = { ok: true; data: T } | { ok: false; error: string; setup?: boolean };
