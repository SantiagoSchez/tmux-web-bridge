// The extension's API in twb (/api/ext/*) is typed in shared/types.ts.
import type { ExtLaunchRequest, ExtLaunchTarget, ExtTargets, TrelloCard } from '../../shared/types';

export type { BranchList, ExtHostTargets, ExtLaunchRequest, ExtLaunchResult, ExtLaunchTarget, ExtTargets, TrelloCard as CardInfo } from '../../shared/types';

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

/** Where the last task of a board went. */
export interface BoardMemory {
  host: string;
  destination: string;
  space?: string;
  base?: string;
}

/** The last choice of the launch dialog: per board, and the checkboxes for all. */
export interface Memory {
  /** destination: the folder's key ('' for the space's own); space: the open space's ('' for the folder's), missing before there were both; base: the last base branch of a worktree. */
  boards: Record<string, BoardMemory>;
  skipPermissions: boolean;
  worktree: boolean;
}

/** Everything the dialog shows when it opens. */
export interface LaunchContext {
  card: TrelloCard;
  targets: ExtTargets;
  promptTemplate: string;
  remembered?: BoardMemory;
  skipPermissions: boolean;
  worktree: boolean;
}

/** From the content script to the service worker. */
export type Request =
  | { type: 'context'; cardId: string }
  | { type: 'launch'; card: TrelloCard; req: ExtLaunchRequest; destination: string; space: string; worktree: boolean }
  /** The branches of origin of a launch target's repository, for a new worktree's base. */
  | { type: 'branches'; host: string; target: ExtLaunchTarget }
  | { type: 'openOptions' }
  /** A newer version waiting on disk (the kit downloaded it), or null. */
  | { type: 'update' }
  /** Its card in chrome://extensions, where it reloads. */
  | { type: 'openExtensions' };

export type Reply<T> = { ok: true; data: T } | { ok: false; error: string; setup?: boolean };
