import type { PaneGit, SessionInfo } from '../../shared/types.js';
import { shQuote as quote, type TmuxExec } from './exec.js';

/** How often the folders already known are read again (a branch changed, a repo made). */
const RESCAN_MS = 15_000;
const MAX_PATHS = 100;

/** One shell script for every folder: $HOME, then each one's top folder, git dir and branch (or N: not in a repo). */
export function gitScript(paths: string[]): string {
  const each = paths.map(quote).join(' ');
  return (
    `printf 'H\\t%s\\n' "$HOME"; for p in ${each}; do ` +
    `top=$(git -C "$p" rev-parse --show-toplevel 2>/dev/null) || { printf 'N\\t%s\\n' "$p"; continue; }; ` +
    `gd=$(git -C "$p" rev-parse --absolute-git-dir 2>/dev/null); ` +
    `b=$(git -C "$p" symbolic-ref --short -q HEAD 2>/dev/null); ` +
    `printf 'G\\t%s\\t%s\\t%s\\t%s\\n' "$p" "$top" "$gd" "$b"; done; true`
  );
}

/**
 * What gitScript printed: the home folder, and for each folder its worktree (a linked one,
 * whose git dir is …/worktrees/<id>: named after its folder) or else its branch.
 */
export function parseGit(out: string): { home?: string; git: Map<string, PaneGit | null> } {
  let home: string | undefined;
  const git = new Map<string, PaneGit | null>();
  for (const line of out.split('\n')) {
    const [kind, path, top, gitDir, branch] = line.split('\t');
    if (kind === 'H') home = path || undefined;
    else if (kind === 'N' && path) git.set(path, null);
    else if (kind === 'G' && path) {
      if (/\/worktrees\/[^/]+$/.test(gitDir ?? '') && top) git.set(path, { worktree: top.replace(/\/+$/, '').split('/').pop()! });
      else git.set(path, branch ? { branch } : null);
    }
  }
  return { home, git };
}

/**
 * The worktree or branch of the panes' folders, for the detailed list. Read apart from
 * the poll (one script for all of them), when a folder shows up and every RESCAN_MS.
 */
export class GitScanner {
  home?: string;
  private known = new Map<string, PaneGit | null>();
  private scanning = false;
  private lastScan = 0;

  constructor(
    private readonly exec: TmuxExec,
    /** Something read is new: the tree has to go out again. */
    private readonly onChange: () => void,
  ) {}

  /** Puts what is known into the panes, and reads the folders again when it is time. */
  apply(sessions: SessionInfo[]): void {
    const paths = new Set<string>();
    for (const s of sessions)
      for (const w of s.windows)
        for (const p of w.panes) {
          if (!p.path) continue;
          paths.add(p.path);
          const g = this.known.get(p.path);
          if (g) p.git = g;
          else delete p.git;
        }
    const list = [...paths].slice(0, MAX_PATHS);
    const unknown = list.some((p) => !this.known.has(p));
    if (!this.scanning && list.length && (unknown || Date.now() - this.lastScan > RESCAN_MS)) void this.scan(list);
  }

  private async scan(paths: string[]): Promise<void> {
    this.scanning = true;
    try {
      const { home, git } = parseGit(await this.exec.shell(gitScript(paths)));
      const before = JSON.stringify([this.home, [...this.known]]);
      this.home = home;
      this.known = git;
      if (JSON.stringify([this.home, [...this.known]]) !== before) this.onChange();
    } catch {
      // No shell or no git there: the list goes without it, and it is tried again later.
      for (const p of paths) if (!this.known.has(p)) this.known.set(p, null);
    } finally {
      this.lastScan = Date.now();
      this.scanning = false;
    }
  }
}
