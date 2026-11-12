// Names of the git worktrees a task starts in (`claude --worktree <name>`): Claude Code
// takes letters, digits, '.', '_', '-' and '/', up to 64 characters.

export const WORKTREE_MAX = 64;
const WORKTREE_RE = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;

/** Why a worktree name is not valid, or null if it is. */
export function worktreeNameProblem(name: string): string | null {
  if (!name) return 'Falta el nombre del worktree';
  if (name.length > WORKTREE_MAX) return `El nombre del worktree pasa de ${WORKTREE_MAX} caracteres`;
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

/** `prefix-slug` cut to fit, at a '-' when it can, never losing the prefix. */
function withSlug(prefix: string, text: string, suffix = ''): string {
  const room = WORKTREE_MAX - prefix.length - suffix.length;
  let slug = slugify(text);
  if (slug.length > room) {
    slug = slug.slice(0, room);
    const cut = slug.lastIndexOf('-');
    if (cut > room / 2) slug = slug.slice(0, cut);
    slug = slug.replace(/-+$/, '');
  }
  return [prefix.replace(/-$/, ''), slug, suffix.replace(/^-/, '')].filter(Boolean).join('-');
}

/** A Trello card's worktree: its number and its title, «142-arreglar-login-movil». */
export function cardWorktreeName(idShort: number | undefined, name: string): string {
  return withSlug(idShort ? `${idShort}-` : '', name) || (idShort ? String(idShort) : 'tarea');
}

/** One run of an automation: its name and when, «deps-nocturnas-20261112-1800». */
export function runWorktreeName(name: string, at: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}`;
  return withSlug('', name, `-${stamp}`) || stamp;
}
