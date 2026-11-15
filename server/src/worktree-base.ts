// The branch a new git worktree starts from. Claude Code's own `--worktree` always starts
// from origin's default branch and takes no other, so the hub prepares the base on the
// machine first: with a WorktreeCreate hook (which replaces Claude Code's logic), it makes
// the worktree's branch from origin/<base> for the hook to reuse; without one, it adds the
// worktree itself and claude starts inside it. See the change worktree-base-branch.

import type { BranchList } from '../../shared/types.js';
import { shPath, shQuote } from './exec.js';

/** Seconds a fetch may take before the scripts go on with what the machine knows. */
const FETCH_TIMEOUT = 20;
/** koalarnes.json is small; more than this is not one. */
const MAX_CONFIG = 65_536;

/**
 * Enters the folder's repository (`top` is its top level) or runs `outside`. Then the
 * helpers both scripts use: no credential prompts, `t` to bound a fetch when the machine
 * has `timeout`, `oneline` to fit text in one tagged line, `has` for a branch of origin.
 */
function prelude(path: string, outside: string): string {
  return (
    `cd ${shPath(path)} 2>/dev/null && top=$(git rev-parse --show-toplevel 2>/dev/null) || { ${outside}; }; ` +
    `export GIT_TERMINAL_PROMPT=0; t=''; command -v timeout >/dev/null 2>&1 && t='timeout ${FETCH_TIMEOUT}'; ` +
    `oneline() { tr '\\n\\r\\t' '   '; }; ` +
    `has() { git show-ref --verify --quiet "refs/remotes/origin/$1"; }; `
  );
}

/**
 * Sets `dh`, origin's default branch (origin/HEAD, else master or main), and `pb`, the
 * project's base: koalarnes.json's git.baseBranch while origin has it, else `dh`. A text
 * match on the file in one line, so the launch can compare without a JSON parser; the
 * branch list uses the same, so both always agree.
 */
const PROJECT_BASE =
  `dh=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null); dh=\${dh#origin/}; ` +
  `[ -n "$dh" ] && ! has "$dh" && dh=''; ` +
  `if [ -z "$dh" ]; then for c in master main; do has "$c" && { dh=$c; break; }; done; fi; ` +
  `pb=''; f="$top/.claude/koalarnes.json"; ` +
  `[ -f "$f" ] && pb=$(head -c ${MAX_CONFIG} "$f" | oneline | sed -n 's/.*"baseBranch"[[:space:]]*:[[:space:]]*"\\([^"]*\\)".*/\\1/p'); ` +
  `[ -n "$pb" ] && ! has "$pb" && pb=''; ` +
  `[ -z "$pb" ] && pb=$dh; `;

/**
 * Sets `hook` when Claude Code has a WorktreeCreate hook for this repository: in the user's
 * settings, the project's (shared or local), or a plugin one of them enables. A text match
 * too; a hook declared anywhere else is missed (see design D2).
 */
const HOOK =
  `cfg=\${CLAUDE_CONFIG_DIR:-$HOME/.claude}; hook=''; ` +
  `for s in "$cfg/settings.json" "$top/.claude/settings.json" "$top/.claude/settings.local.json"; do ` +
  `[ -f "$s" ] || continue; grep -q '"WorktreeCreate"' "$s" && hook=1; ` +
  `for pm in $(oneline < "$s" | grep -o '"[A-Za-z0-9._-]*@[A-Za-z0-9._-]*"[[:space:]]*:[[:space:]]*true' | sed 's/^"\\([^"]*\\)".*/\\1/'); do ` +
  `for h in "$cfg/plugins/cache/\${pm#*@}/\${pm%@*}"/*/hooks/hooks.json "$cfg/plugins/cache/\${pm#*@}/\${pm%@*}"/*/.claude-plugin/plugin.json; do ` +
  `[ -f "$h" ] && grep -q '"WorktreeCreate"' "$h" && hook=1; done; done; done; `;

/**
 * The branches of origin of the folder's repository, after a fetch: R (a repository), F and
 * why the fetch failed, B and each branch, D and the project's base. Nothing outside git.
 */
export function branchesScript(path: string): string {
  return (
    prelude(path, 'exit 0') +
    `printf 'R\\t1\\n'; ` +
    `if git remote get-url origin >/dev/null 2>&1; then ` +
    `if ! err=$($t git fetch --prune --quiet origin 2>&1); then printf 'F\\t%s\\n' "$(printf %s "\${err:-sin respuesta en ${FETCH_TIMEOUT} s}" | oneline)"; fi; ` +
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
 * Prepares worktree `worktree` from origin/`base` in the folder's repository, before claude
 * starts (design D1). Answers one line: E and why (repo, base, git and its message); X, the
 * branch exists (with a path: the worktree to start in, when there is no hook); N, nothing
 * to do; H, the branch was made for the hook; W and the worktree made.
 */
export function prepareScript(path: string, worktree: string, base: string): string {
  return (
    `w=${shQuote(worktree)}; b=${shQuote(base)}; ` +
    prelude(path, `printf 'E\\trepo\\n'; exit 0`) +
    `fail() { printf 'E\\tgit\\t%s\\n' "$(printf %s "$1" | oneline)"; exit 0; }; ` +
    `exclude() { ex=$(git rev-parse --git-path info/exclude); mkdir -p "$(dirname "$ex")"; grep -qxF '.claude/worktrees/' "$ex" 2>/dev/null || printf '.claude/worktrees/\\n' >> "$ex"; }; ` +
    `$t git fetch --quiet origin "+refs/heads/$b:refs/remotes/origin/$b" >/dev/null 2>&1; ` +
    `has "$b" || { printf 'E\\tbase\\n'; exit 0; }; ` +
    HOOK +
    `dir="$top/.claude/worktrees/$(printf %s "$w" | tr / -)"; ` +
    `here=''; git show-ref --verify --quiet "refs/heads/$w" && here=local; [ -z "$here" ] && has "$w" && here=remote; ` +
    `if [ -n "$here" ]; then ` +
    `[ -n "$hook" ] && { printf 'X\\n'; exit 0; }; ` +
    `at=$(git worktree list --porcelain | awk -v r="branch refs/heads/$w" '/^worktree /{p=substr($0,10)} $0==r{print p; exit}'); ` +
    `[ -n "$at" ] && { printf 'X\\t%s\\n' "$at"; exit 0; }; ` +
    `exclude; ` +
    `if [ "$here" = local ]; then err=$(git worktree add --quiet "$dir" "$w" 2>&1) || fail "$err"; ` +
    `else err=$(git worktree add --quiet --track -b "$w" "$dir" "refs/remotes/origin/$w" 2>&1) || fail "$err"; fi; ` +
    `printf 'X\\t%s\\n' "$dir"; exit 0; fi; ` +
    PROJECT_BASE +
    `if [ -n "$hook" ]; then ` +
    `[ "$b" = "$pb" ] && { printf 'N\\n'; exit 0; }; ` +
    `err=$(git branch --no-track "$w" "refs/remotes/origin/$b" 2>&1) || fail "$err"; ` +
    `printf 'H\\n'; exit 0; fi; ` +
    `[ "$b" = "$dh" ] && { printf 'N\\n'; exit 0; }; ` +
    `exclude; ` +
    `err=$(git worktree add --quiet --no-track -b "$w" "$dir" "refs/remotes/origin/$b" 2>&1) || fail "$err"; ` +
    `printf 'W\\t%s\\n' "$dir"`
  );
}

/**
 * How the worktree goes ahead, from prepareScript's answer: `claude --worktree` (native: as
 * before; hook: the hook reuses the branch made; reused: the branch existed, and with `path`
 * claude starts there instead) or `cd` into the worktree made (`created`).
 */
export type Prepared = { kind: 'native' } | { kind: 'hook' } | { kind: 'reused'; path?: string } | { kind: 'created'; path: string };

/** What prepareScript printed. Its errors are thrown, in Spanish, for the panel. */
export function parsePrepare(out: string, base: string): Prepared {
  const line = out.split('\n').find((l) => /^[EXNHW](\t|$)/.test(l)) ?? '';
  const [tag, ...rest] = line.split('\t');
  const value = rest.join('\t');
  switch (tag) {
    case 'N':
      return { kind: 'native' };
    case 'H':
      return { kind: 'hook' };
    case 'X':
      return value ? { kind: 'reused', path: value } : { kind: 'reused' };
    case 'W':
      if (value) return { kind: 'created', path: value };
      break;
    case 'E':
      if (rest[0] === 'repo') throw new Error('La carpeta no está en un repositorio git: no se puede crear un worktree');
      if (rest[0] === 'base') throw new Error(`No existe la rama base «${base}» en origin`);
      throw new Error(`No se ha podido preparar el worktree: ${rest.slice(1).join('\t').trim() || 'git ha fallado'}`);
  }
  throw new Error('No se ha podido preparar el worktree');
}
