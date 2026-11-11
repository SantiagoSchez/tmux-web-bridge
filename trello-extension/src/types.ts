// The extension's API in twb (GET /api/ext/targets, POST /api/ext/launch) is typed in shared/types.ts.
import type { ExtLaunchRequest, ExtLaunchResult, ExtTargets } from '../../shared/types';

export type { ExtHostTargets, ExtLaunchRequest, ExtLaunchResult, ExtLaunchTarget, ExtTargets } from '../../shared/types';

// ---------------------------------------------------------------- the extension's own

/** What the options page sets (chrome.storage.local). */
export interface Settings {
  /** The twb panel, e.g. https://twb.example.com (no trailing slash). */
  hubUrl: string;
  hubToken: string;
  trelloKey: string;
  trelloToken: string;
  /** With {url}, {name}, {shortLink} and {board}. */
  promptTemplate: string;
}

/** The last choice of the launch dialog: per board, and the permissions checkbox for all. */
export interface Memory {
  boards: Record<string, { host: string; destination: string }>;
  skipPermissions: boolean;
}

/** A Trello card as the dialog needs it. */
export interface CardInfo {
  id: string;
  name: string;
  /** https://trello.com/c/<shortLink> */
  url: string;
  shortLink: string;
  idList: string;
  board: { id: string; name: string };
}

/** Everything the dialog shows when it opens. */
export interface LaunchContext {
  card: CardInfo;
  targets: ExtTargets;
  promptTemplate: string;
  remembered?: { host: string; destination: string };
  skipPermissions: boolean;
}

export interface LaunchOutcome {
  result: ExtLaunchResult;
  /** The list the card went to, if it moved. */
  movedTo?: string;
  commented: boolean;
  /** What went wrong after the launch, which did happen. */
  warnings: string[];
}

/** From the content script to the service worker. */
export type Request =
  | { type: 'context'; cardId: string }
  | { type: 'launch'; card: CardInfo; req: ExtLaunchRequest; destination: string }
  | { type: 'openOptions' }
  /** A newer version waiting on disk (the kit downloaded it), or null. */
  | { type: 'update' }
  /** Its card in chrome://extensions, where it reloads. */
  | { type: 'openExtensions' };

export type Reply<T> = { ok: true; data: T } | { ok: false; error: string; setup?: boolean };
