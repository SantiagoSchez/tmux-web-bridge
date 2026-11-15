// Names of the git worktrees a task starts in (`claude --worktree <name>`): Claude Code
// takes letters, digits, '.', '_', '-' and '/', up to 64 characters. And the branch of
// origin a new worktree starts from.

import type { BranchList } from './types.js';

export const WORKTREE_MAX = 64;
const WORKTREE_RE = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;

/** Why a worktree name is not valid, or null if it is. */
export function worktreeNameProblem(name: string): string | null {
  if (!name) return 'Falta el nombre del worktree';
  if (name.length > WORKTREE_MAX) return `El nombre del worktree pasa de ${WORKTREE_MAX} caracteres`;
  // It is also the branch's name, and git would read a leading '-' as an option.
  if (name.startsWith('-')) return 'El nombre del worktree no puede empezar por «-»';
  if (!WORKTREE_RE.test(name) || name.split('/').some((s) => s === '.' || s === '..')) {
    return 'El nombre del worktree solo admite letras, números, «.», «_», «-» y «/»';
  }
  return null;
}

/** Text as a slug: lower case, no accents, words joined with '-'. */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** `prefix-slug` cut to fit in `max`, at a '-' when it can, never losing the prefix. */
function withSlug(prefix: string, text: string, suffix = '', max = WORKTREE_MAX): string {
  const room = max - prefix.length - suffix.length;
  let slug = slugify(text);
  if (slug.length > room) {
    slug = slug.slice(0, room);
    const cut = slug.lastIndexOf('-');
    if (cut > room / 2) slug = slug.slice(0, cut);
    slug = slug.replace(/-+$/, '');
  }
  return [prefix.replace(/-$/, ''), slug, suffix.replace(/^-/, '')].filter(Boolean).join('-');
}

/** Labels that make a card a bug fix: one of these words in their name (not «hotfix»), in any case and with or without accents. */
const BUGFIX_WORDS = new Set(['bug', 'bugs', 'bugfix', 'bugfixes', 'fix', 'fixes', 'issue', 'issues']);

/**
 * A Trello card's worktree, also its branch: bugfix/ if a label says «bug», «fix» or «issue»
 * (feature/ otherwise, with no labels too), then its number and its title, all within
 * the limit: «feature/142-arreglar-login-movil».
 */
export function cardWorktreeName(card: { idShort?: number; name: string; labels?: readonly { name: string }[] }): string {
  const bugfix = (card.labels ?? []).some((l) => slugify(l.name).split('-').some((w) => BUGFIX_WORDS.has(w)));
  const branch = bugfix ? 'bugfix/' : 'feature/';
  const id = card.idShort ? `${card.idShort}-` : '';
  return branch + (withSlug(id, card.name, '', WORKTREE_MAX - branch.length) || 'tarea');
}

/** The window a card's task opens in: its worktree, with feat/ or bug/ for the branch prefix so more of the title fits. */
export function cardWindowName(worktree: string): string {
  return worktree.replace(/^feature\//, 'feat/').replace(/^bugfix\//, 'bug/');
}

/** One run of an automation: its name and when, «deps-nocturnas-20261112-1800». */
export function runWorktreeName(name: string, at: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}`;
  return withSlug('', name, `-${stamp}`) || stamp;
}

const BRANCH_MAX = 200;

/**
 * Why a base branch name is not one git takes (the rules of `git check-ref-format --branch`
 * that matter here), or null if it is. Checked before the name reaches a machine.
 */
export function branchNameProblem(name: string): string | null {
  if (!name) return 'Falta la rama base';
  const bad =
    name.length > BRANCH_MAX ||
    name === '@' ||
    // A valid ref name, but origin/HEAD points at another branch: never a base of its own.
    name === 'HEAD' ||
    name.startsWith('-') ||
    /[\x00-\x20\x7f~^:?*[\\]/.test(name) ||
    name.includes('..') ||
    name.includes('@{') ||
    name.split('/').some((part) => !part || part.startsWith('.') || part.endsWith('.lock')) ||
    name.endsWith('.');
  return bad ? `«${name.slice(0, 60)}» no es un nombre de rama válido` : null;
}

/**
 * The base branch a dialog offers first: the one remembered (for the board or the folder)
 * while origin still has it, else the project's base, else the first branch.
 */
export function pickBase(remembered: string | undefined, list: BranchList): string | undefined {
  if (!list.repo) return undefined;
  if (remembered && list.branches.includes(remembered)) return remembered;
  return list.base ?? list.branches[0];
}
