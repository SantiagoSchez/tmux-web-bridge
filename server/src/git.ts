import type { ChangeProgress, PaneGit, PaneInfo, SessionInfo } from '../../shared/types.js';
import { CHANGES_SCRIPT, parseChanges } from './change-progress.js';
import { shQuote as quote, type TmuxExec } from './exec.js';

/** How often the folders already known are read again (a branch changed, a repo made). */
const RESCAN_MS = 15_000;
const MAX_PATHS = 100;

/**
 * One shell script for every folder: $HOME, then each one's top folder, git dir and branch
 * (or N: not in a repo); then, once per top folder, its active OpenSpec changes when it runs
 * the koalarnes harness (change-progress.ts).
 */
export function gitScript(paths: string[]): string {
  const each = paths.map(quote).join(' ');
  return (
    `printf 'H\\t%s\\n' "$HOME"; tops=; for p in ${each}; do ` +
    `top=$(git -C "$p" rev-parse --show-toplevel 2>/dev/null) || { printf 'N\\t%s\\n' "$p"; continue; }; ` +
    `gd=$(git -C "$p" rev-parse --absolute-git-dir 2>/dev/null); ` +
    `b=$(git -C "$p" symbolic-ref --short -q HEAD 2>/dev/null); ` +
    `printf 'G\\t%s\\t%s\\t%s\\t%s\\n' "$p" "$top" "$gd" "$b"; ` +
    `tops="$tops$top\n"; done; ` +
    `printf '%s' "$tops" | sort -u | while IFS= read -r top; do ${CHANGES_SCRIPT}done; true`
  );
}

/**
 * What gitScript printed: the home folder; for each folder its worktree (a linked one,
 * whose git dir is …/worktrees/<id>: named after its folder) or else its branch; and the
 * active changes of each folder in a repository that has any.
 */
export function parseGit(out: string): { home?: string; git: Map<string, PaneGit | null>; changes: Map<string, ChangeProgress[]> } {
  let home: string | undefined;
  const git = new Map<string, PaneGit | null>();
  const topOf = new Map<string, string>();
  const lines = out.split('\n');
  for (const line of lines) {
    const [kind, path, top, gitDir, branch] = line.split('\t');
    if (kind === 'H') home = path || undefined;
    else if (kind === 'N' && path) git.set(path, null);
    else if (kind === 'G' && path) {
      if (top) topOf.set(path, top);
      if (/\/worktrees\/[^/]+$/.test(gitDir ?? '') && top) git.set(path, { worktree: top.replace(/\/+$/, '').split('/').pop()! });
      else git.set(path, branch ? { branch } : null);
    }
  }
  const byTop = parseChanges(lines);
  const changes = new Map<string, ChangeProgress[]>();
  for (const [path, top] of topOf) {
    const found = byTop.get(top);
    if (found?.length) changes.set(path, found);
  }
  return { home, git, changes };
}

/**
 * The worktree or branch of the panes' folders, and the OpenSpec changes of their
 * repositories, for the detailed list. Read apart from the poll (one script for all of
 * them), when a folder shows up, when a pane changes state (a Claude turn may have ticked
 * tasks or reviewed its change) and every RESCAN_MS.
 */
export class GitScanner {
  home?: string;
  private known = new Map<string, PaneGit | null>();
  private changes = new Map<string, ChangeProgress[]>();
  private scanning = false;
  private lastScan = 0;
  /** The state of each pane at the last apply, to notice a change. */
  private states = new Map<string, PaneInfo['state']>();
  /** A pane changed state and no reading has started since. */
  private due = false;

  constructor(
    private readonly exec: Pick<TmuxExec, 'shell'>,
    /** Something read is new: the tree has to go out again. */
    private readonly onChange: () => void,
  ) {}

  /** Puts what is known into the panes, and reads the folders again when it is time. */
  apply(sessions: SessionInfo[]): void {
    const paths = new Set<string>();
    const states = new Map<string, PaneInfo['state']>();
    for (const s of sessions)
      for (const w of s.windows)
        for (const p of w.panes) {
          states.set(p.id, p.state);
          // A pane seen for the first time is no change: it showed up, its folder is read if new.
          if (this.states.has(p.id) && this.states.get(p.id) !== p.state) this.due = true;
          if (!p.path) continue;
          paths.add(p.path);
          const g = this.known.get(p.path);
          if (g) p.git = g;
          else delete p.git;
          const c = this.changes.get(p.path);
          if (c) p.changes = c;
          else delete p.changes;
        }
    this.states = states;
    const list = [...paths].slice(0, MAX_PATHS);
    const unknown = list.some((p) => !this.known.has(p));
    // A state change seen during a reading stays due and reads once that reading ends.
    if (!this.scanning && list.length && (unknown || this.due || Date.now() - this.lastScan > RESCAN_MS)) void this.scan(list);
  }

  private async scan(paths: string[]): Promise<void> {
    this.scanning = true;
    this.due = false;
    try {
      const { home, git, changes } = parseGit(await this.exec.shell(gitScript(paths)));
      const before = JSON.stringify([this.home, [...this.known], [...this.changes]]);
      this.home = home;
      this.known = git;
      this.changes = changes;
      if (JSON.stringify([this.home, [...this.known], [...this.changes]]) !== before) this.onChange();
    } catch {
      // No shell or no git there: the list goes without it, and it is tried again later.
      for (const p of paths) if (!this.known.has(p)) this.known.set(p, null);
    } finally {
      this.lastScan = Date.now();
      this.scanning = false;
    }
  }
}
