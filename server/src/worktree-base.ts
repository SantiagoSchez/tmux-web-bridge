// The branch a new git worktree starts from. Claude Code's own `--worktree` always starts
// from origin's default branch, takes no other and names its branch `worktree-<name>`, so
// the hub prepares the worktree on the machine first: with a WorktreeCreate hook (which
// replaces Claude Code's logic), it makes the worktree's branch from origin/<base> for the
// hook to reuse; without one, it adds the worktree itself and claude starts inside it. See
// the change worktree-base-branch.

import type { BranchList } from '../../shared/types.js';
import { shPath, shQuote, tmuxFunction } from './exec.js';
import { CONFIG_FILE, MAX_CONFIG } from './harness-config.js';

/** Seconds a fetch may take before the scripts go on with what the machine knows. */
const FETCH_SECONDS = 12;
/** Seconds `git ls-remote` may take to tell a missing branch from a remote that does not answer. */
const LS_REMOTE_SECONDS = 6;
/**
 * Seconds to ask the remote for a branch named like the worktree, and to fetch it: with the
 * base's fetch (12 s), a launch stays under the hub's 25 s, unless several SSH agents do not
 * answer (AGENT_SECONDS each, asked once, before the fetch).
 */
const BRANCH_SECONDS = 4;
const BRANCH_FETCH_SECONDS = 6;

/** Seconds an SSH agent may take to say whether it has keys. */
const AGENT_SECONDS = 2;

/**
 * The hub reaches a machine over `ssh … sh -c`, a session without the SSH agent of the
 * owner's terminals, so a key that lives only in that agent never reaches `git fetch` over
 * ssh. Without an agent that has keys, this takes the first one that does: the machine's tmux
 * server's, then each tmux session's (what a terminal brings on attach), then macOS's own
 * (launchd's socket). Only sockets of the user's own are asked, each once and bounded, and
 * the paths are read one per line, so a path with spaces stays one. `tmux` is the command line that reaches the
 * machine's tmux server. Needs `bounded`.
 */
function sshAgent(tmux: string): string {
  return (
    `${tmuxFunction('t', tmux)}; ` +
    `keys() { [ -S "$1" ] && [ -O "$1" ] && bounded ${AGENT_SECONDS} env SSH_AUTH_SOCK="$1" ssh-add -l; }; ` +
    `if ! keys "\${SSH_AUTH_SOCK:-}"; then ` +
    `nl=$(printf '\\nx'); nl=\${nl%x}; ifs=$IFS; IFS=$nl; tried="$nl\${SSH_AUTH_SOCK:-}$nl"; ` +
    `for a in $( { t show-environment -g SSH_AUTH_SOCK; for s in $(t list-sessions -F '#{session_id}'); do t show-environment -t "$s" SSH_AUTH_SOCK; done; } | sed -n 's/^SSH_AUTH_SOCK=//p' ) /private/tmp/com.apple.launchd.*/Listeners; do ` +
    `case "$tried" in *"$nl$a$nl"*) continue ;; esac; tried="$tried$a$nl"; ` +
    `keys "$a" && { SSH_AUTH_SOCK=$a; export SSH_AUTH_SOCK; break; }; done; IFS=$ifs; fi; `
  );
}

/**
 * Enters the folder's repository (`top` is its top level) or runs `outside`. Then the
 * helpers both scripts use: no credential prompts, an SSH agent with keys (see `sshAgent`),
 * `oneline` to fit text in one tagged line, `has` for a branch of origin, and
 * `bounded <seconds> <command…>`, which runs a command with its errors in `$tmp` and kills it
 * when it takes longer (`timeout` is not on a stock macOS), with its direct children: the ssh
 * or git-remote-https that hangs on the network. Errors go to a file, not a pipe, so a
 * process left behind cannot hold the script open.
 */
export function prelude(path: string, outside: string, tmux: string): string {
  return (
    `cd ${shPath(path)} 2>/dev/null && top=$(git rev-parse --show-toplevel 2>/dev/null) || { ${outside}; }; ` +
    `export GIT_TERMINAL_PROMPT=0; ` +
    `oneline() { tr '\\n\\r\\t' '   '; }; ` +
    `has() { git show-ref --verify --quiet "refs/remotes/origin/$1"; }; ` +
    `tmp=$(mktemp 2>/dev/null || echo "/tmp/twb-git-$$"); trap 'rm -f "$tmp"' EXIT; ` +
    `bounded() { s=$1; shift; "$@" >/dev/null 2>"$tmp" </dev/null & p=$!; ` +
    `( sleep "$s"; c=$(pgrep -P "$p" 2>/dev/null); kill "$p" 2>/dev/null; [ -n "$c" ] && kill $c 2>/dev/null ) >/dev/null 2>&1 </dev/null & k=$!; ` +
    `wait "$p"; r=$?; kill "$k" 2>/dev/null; return $r; }; ` +
    sshAgent(tmux)
  );
}

/**
 * Sets `dh`, origin's default branch (origin/HEAD, else master or main), and `pb`, the
 * project's base: git.baseBranch of the harness configuration (harness-config.ts) while
 * origin has it, else `dh`. A text match on the file in one line, so the launch can compare
 * without a JSON parser; the branch list uses the same, so both always agree.
 */
const PROJECT_BASE =
  `dh=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null); dh=\${dh#origin/}; ` +
  `[ -n "$dh" ] && ! has "$dh" && dh=''; ` +
  `if [ -z "$dh" ]; then for c in master main; do has "$c" && { dh=$c; break; }; done; fi; ` +
  `pb=''; ` +
  CONFIG_FILE +
  `[ -f "$f" ] && pb=$(head -c ${MAX_CONFIG} "$f" | oneline | sed -n 's/.*"baseBranch"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p'); ` +
  `[ -n "$pb" ] && ! has "$pb" && pb=''; ` +
  `[ -z "$pb" ] && pb=$dh; `;

/**
 * Sets `hook` when Claude Code has a WorktreeCreate hook for this repository: in the user's
 * settings, the project's (shared, or local in the checkout or the main one), or a plugin one
 * of them enables. A text match too; a hook declared anywhere else is missed (design D2).
 * The user's settings and plugins are those of the panes' Claude Code: the folder of the tmux
 * server's global CLAUDE_CONFIG_DIR, which the SSH session lacks, or ~/.claude. Needs `t`.
 */
const HOOK =
  `cfg=$(t show-environment -g CLAUDE_CONFIG_DIR); ` +
  `case "$cfg" in CLAUDE_CONFIG_DIR=?*) cfg=\${cfg#CLAUDE_CONFIG_DIR=} ;; *) cfg=$HOME/.claude ;; esac; hook=''; ` +
  `for s in "$cfg/settings.json" "$top/.claude/settings.json" "$top/.claude/settings.local.json" "$main/.claude/settings.local.json"; do ` +
  `[ -f "$s" ] || continue; grep -q '"WorktreeCreate"' "$s" && hook=1; ` +
  `for pm in $(oneline < "$s" | grep -o '"[A-Za-z0-9._-]*@[A-Za-z0-9._-]*"[[:space:]]*:[[:space:]]*true' | sed 's/^"\\([^"]*\\)".*/\\1/'); do ` +
  `for h in "$cfg/plugins/cache/\${pm#*@}/\${pm%@*}"/*/hooks/hooks.json "$cfg/plugins/cache/\${pm#*@}/\${pm%@*}"/*/.claude-plugin/plugin.json; do ` +
  `[ -f "$h" ] && grep -q '"WorktreeCreate"' "$h" && hook=1; done; done; done; `;

/**
 * The branches of origin of the folder's repository, after a fetch: R (a repository), F and
 * why the fetch failed, B and each branch, D and the project's base. Nothing outside git.
 * `tmux` reaches the machine's tmux server, for its SSH agent.
 */
export function branchesScript(path: string, tmux: string): string {
  return (
    prelude(path, 'exit 0', tmux) +
    `printf 'R\\t1\\n'; ` +
    `if git remote get-url origin >/dev/null 2>&1; then ` +
    `if ! bounded ${FETCH_SECONDS} git fetch --prune --quiet origin; then err=$(oneline < "$tmp"); printf 'F\\t%s\\n' "\${err:-sin respuesta en ${FETCH_SECONDS} s}"; fi; ` +
    `else printf 'F\\tEl repositorio no tiene remoto origin\\n'; fi; ` +
    `git for-each-ref --format='B%09%(refname:lstrip=3)' refs/remotes/origin; ` +
    PROJECT_BASE +
    `[ -n "$pb" ] && printf 'D\\t%s\\n' "$pb"; true`
  );
}

/** What branchesScript printed. */
export function parseBranches(out: string): BranchList {
  const lines = out.split('\n');
  if (!lines.includes('R\t1')) return { repo: false };
  const list: BranchList = { repo: true, branches: [] };
  for (const line of lines) {
    const tab = line.indexOf('\t');
    const tag = line.slice(0, tab);
    const value = line.slice(tab + 1);
    if (tag === 'B' && value && value !== 'HEAD') list.branches.push(value);
    else if (tag === 'D' && value) list.base = value;
    else if (tag === 'F') list.fetchError = value.trim() || 'No se ha podido actualizar';
  }
  list.branches.sort();
  if (list.base && !list.branches.includes(list.base)) delete list.base;
  return list;
}

/**
 * Prepares worktree `worktree` in the folder's repository before claude starts (design D1).
 * `base` may be empty: with a hook, the hook then decides; without one, the project's base,
 * else HEAD. Prints S and why first when origin could not be reached, then one line:
 * E and why (repo, base, unreachable, inuse and the path, git and its message); X, the branch
 * exists, locally, in origin or on the remote (with the path to start in when there is no hook,
 * and 1 when it is at origin/<base>);
 * N, nothing to do; H, the branch was made for the hook; W and the worktree made.
 * `tmux` reaches the machine's tmux server, for its SSH agent.
 */
export function prepareScript(path: string, worktree: string, base: string, tmux: string): string {
  return (
    `w=${shQuote(worktree)}; b=${shQuote(base)}; ` +
    prelude(path, `printf 'E\\trepo\\n'; exit 0`, tmux) +
    `fail() { printf 'E\\tgit\\t%s\\n' "$(printf %s "$1" | oneline)"; exit 0; }; ` +
    // New worktrees go under the main checkout, never inside a linked worktree the target is in.
    `main=$(git worktree list --porcelain 2>/dev/null | sed -n '1s/^worktree //p'); [ -n "$main" ] || main=$top; ` +
    `dir="$main/.claude/worktrees/$(printf %s "$w" | tr / -)"; ` +
    // Its folder deleted by hand, the worktree is still registered (maybe locked): forget that one, no other.
    `[ -d "$dir" ] || git worktree remove --force --force "$dir" >/dev/null 2>&1; ` +
    `exclude() { ex=$(git rev-parse --git-path info/exclude); mkdir -p "$(dirname "$ex")"; grep -qxF '.claude/worktrees/' "$ex" 2>/dev/null || printf '.claude/worktrees/\\n' >> "$ex"; }; ` +
    // The ignored files .worktreeinclude selects, copied as Claude Code's own worktrees do.
    `include() { [ -f "$main/.worktreeinclude" ] || return 0; ` +
    `( cd "$main" && git ls-files --others --ignored --exclude-from=.worktreeinclude | git check-ignore --stdin ) 2>/dev/null | ` +
    `while IFS= read -r f; do mkdir -p "$dir/$(dirname "$f")" && cp -p "$main/$f" "$dir/$f"; done; }; ` +
    HOOK +
    PROJECT_BASE +
    `[ -z "$b" ] && [ -z "$hook" ] && b=$pb; stale=''; ` +
    `if [ -n "$b" ]; then ` +
    `bounded ${FETCH_SECONDS} git fetch --quiet origin "+refs/heads/$b:refs/remotes/origin/$b"; r=$?; ` +
    `if [ "$r" -ne 0 ]; then why=$(oneline < "$tmp"); why=\${why:-sin respuesta en ${FETCH_SECONDS} s}; lr=1; ` +
    `if [ "$r" -ne 143 ]; then bounded ${LS_REMOTE_SECONDS} git ls-remote --exit-code origin "refs/heads/$b"; lr=$?; fi; ` +
    `[ "$lr" -eq 2 ] && { printf 'E\\tbase\\n'; exit 0; }; ` +
    `[ "$lr" -eq 0 ] && fail "$why"; ` +
    `has "$b" || { printf 'E\\tunreachable\\t%s\\n' "$why"; exit 0; }; ` +
    `stale=1; printf 'S\\t%s\\n' "$why"; fi; ` +
    `has "$b" || { printf 'E\\tbase\\n'; exit 0; }; fi; ` +
    `here=''; git show-ref --verify --quiet "refs/heads/$w" && here=local; [ -z "$here" ] && has "$w" && here=remote; ` +
    // A branch pushed from elsewhere that the clone has not fetched: reused, not shadowed by a new one.
    `if [ -z "$here" ] && [ -z "$stale" ] && { [ -n "$b" ] || [ -z "$hook" ]; }; then ` +
    `if bounded ${BRANCH_SECONDS} git ls-remote --exit-code origin "refs/heads/$w"; then ` +
    `bounded ${BRANCH_FETCH_SECONDS} git fetch --quiet origin "+refs/heads/$w:refs/remotes/origin/$w" || ` +
    `{ why=$(oneline < "$tmp"); fail "origin tiene la rama $w y no se ha podido traer: \${why:-sin respuesta en ${BRANCH_FETCH_SECONDS} s}"; }; ` +
    `here=remote; fi; fi; ` +
    `if [ -n "$here" ]; then ` +
    `ref="refs/heads/$w"; [ "$here" = remote ] && ref="refs/remotes/origin/$w"; ` +
    `same=''; [ -n "$b" ] && [ "$(git rev-parse "$ref")" = "$(git rev-parse "refs/remotes/origin/$b")" ] && same=1; ` +
    `[ -n "$hook" ] && { printf 'X\\t\\t%s\\n' "$same"; exit 0; }; ` +
    `at=$(git worktree list --porcelain | awk -v r="branch refs/heads/$w" '/^worktree /{p=substr($0,10)} $0==r{print p; exit}'); ` +
    `if [ -n "$at" ]; then [ "$at" = "$dir" ] && { printf 'X\\t%s\\t%s\\n' "$dir" "$same"; exit 0; }; printf 'E\\tinuse\\t%s\\n' "$at"; exit 0; fi; ` +
    `exclude; ` +
    `if [ "$here" = local ]; then err=$(git worktree add --quiet "$dir" "$w" 2>&1) || fail "$err"; ` +
    `else err=$(git worktree add --quiet --track -b "$w" "$dir" "refs/remotes/origin/$w" 2>&1) || fail "$err"; fi; ` +
    `include; printf 'X\\t%s\\t%s\\n' "$dir" "$same"; exit 0; fi; ` +
    `if [ -n "$hook" ]; then ` +
    `[ -z "$b" ] && { printf 'N\\n'; exit 0; }; ` +
    `err=$(git branch --no-track -- "$w" "refs/remotes/origin/$b" 2>&1) || fail "$err"; ` +
    `printf 'H\\n'; exit 0; fi; ` +
    `exclude; from=HEAD; [ -n "$b" ] && from="refs/remotes/origin/$b"; ` +
    `err=$(git worktree add --quiet --no-track -b "$w" "$dir" "$from" 2>&1) || fail "$err"; ` +
    `include; printf 'W\\t%s\\n' "$dir"`
  );
}

/**
 * How the worktree goes ahead, from prepareScript's answer: `claude --worktree` (native: a
 * hook decides; hook: the hook reuses the branch made; reused: the branch existed, and with
 * `path` claude starts there instead) or `cd` into the worktree made (`created`). `atBase`:
 * the existing branch is at origin/<base> anyway. `stale`: why origin could not be updated.
 */
export type Prepared = ({ kind: 'native' } | { kind: 'hook' } | { kind: 'reused'; path?: string; atBase?: true } | { kind: 'created'; path: string }) & {
  stale?: string;
};

/** What prepareScript printed. Its errors are thrown, in Spanish, for the panel. */
export function parsePrepare(out: string, worktree: string, base: string): Prepared {
  const lines = out.split('\n');
  const staleLine = lines.find((l) => l.startsWith('S\t'));
  const stale = staleLine !== undefined ? staleLine.slice(2).trim() || 'sin respuesta' : undefined;
  const line = lines.find((l) => /^[EXNHW](\t|$)/.test(l)) ?? '';
  const [tag, ...rest] = line.split('\t');
  const done = (p: Prepared): Prepared => (stale ? { ...p, stale } : p);
  switch (tag) {
    case 'N':
      return done({ kind: 'native' });
    case 'H':
      return done({ kind: 'hook' });
    case 'X': {
      const p: Prepared = { kind: 'reused' };
      if (rest[0]) p.path = rest[0];
      if (rest[1] === '1') p.atBase = true;
      return done(p);
    }
    case 'W':
      if (rest[0]) return done({ kind: 'created', path: rest[0] });
      break;
    case 'E':
      if (rest[0] === 'repo') throw new Error('La carpeta no está en un repositorio git: no se puede crear un worktree');
      if (rest[0] === 'base') throw new Error(`No existe la rama base «${base}» en origin`);
      if (rest[0] === 'inuse') throw new Error(`La rama ${worktree} está extraída en ${rest[1] ?? 'otra carpeta'}: elige otro nombre para el worktree`);
      if (rest[0] === 'unreachable') throw new Error(`No se ha podido contactar con origin y no se conoce la rama base «${base}»: ${rest.slice(1).join(' ').trim()}`);
      throw new Error(`No se ha podido preparar el worktree: ${rest.slice(1).join('\t').trim() || 'git ha fallado'}`);
  }
  throw new Error('No se ha podido preparar el worktree');
}
