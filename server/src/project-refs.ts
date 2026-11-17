// What a pane's project lets the terminal link (PR #12, Issue #3, pipeline #9, Trello #470):
// its repository and its Trello board. The project's harness configuration (.claude/ka.json,
// else .claude/koalarnes.json) says it first; without a repository there, the folder's origin
// remote. Read on demand by the panel.

import { parseRemote } from '../../shared/refs.js';
import type { RefContext, RefRepo } from '../../shared/types.js';
import { shPath } from './exec.js';
import { CONFIG_FILE, MAX_CONFIG } from './harness-config.js';
import { TRELLO_BOARD } from './trello.js';

const REPOSITORY = /^[\w.-]+\/[\w.-]+$/;

/**
 * One shell script for a folder: K and the top level's harness configuration on one line
 * (its line breaks and tabs, only whitespace in valid JSON, become spaces), and O and the
 * origin remote. Nothing outside a git repository.
 */
export function contextScript(path: string): string {
  return (
    `p=${shPath(path)}; top=$(git -C "$p" rev-parse --show-toplevel 2>/dev/null) || exit 0; ` +
    CONFIG_FILE +
    `[ -f "$f" ] && printf 'K\\t%s\\n' "$(head -c ${MAX_CONFIG} "$f" | tr '\\n\\r\\t' '   ')"; ` +
    `o=$(git -C "$p" remote get-url origin 2>/dev/null) && printf 'O\\t%s\\n' "$o"; true`
  );
}

/** A field of an untrusted object, when it is an object itself. */
const obj = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);

/** What contextScript printed: the harness configuration's platform and board, else the origin remote. Anything malformed is dropped. */
export function parseContext(out: string): RefContext {
  let config: Record<string, unknown> | undefined;
  let remote: RefRepo | undefined;
  for (const line of out.split('\n')) {
    const tab = line.indexOf('\t');
    const tag = line.slice(0, tab);
    const value = line.slice(tab + 1);
    if (tag === 'K') {
      try {
        config = obj(JSON.parse(value));
      } catch {
        config = undefined;
      }
    } else if (tag === 'O') remote = parseRemote(value);
  }
  const ctx: RefContext = {};
  const platform = obj(config?.platform);
  const host = platform?.host;
  const repository = platform?.repository;
  if ((host === 'github' || host === 'bitbucket') && typeof repository === 'string' && REPOSITORY.test(repository)) ctx.repo = { host, path: repository };
  else if (remote) ctx.repo = remote;
  const board = obj(config?.tracker)?.board;
  if (typeof board === 'string' && TRELLO_BOARD.test(board)) ctx.trelloBoard = board;
  return ctx;
}
