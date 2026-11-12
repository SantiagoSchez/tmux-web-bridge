import { posix } from 'node:path';
import type { GitChange, GitChanges, GitDiffMode } from '../../shared/types.js';
import type { HostMonitor } from './host.js';

// Files of a machine for the panel's viewer: a path seen in a pane (relative to its
// folder), read over the same connection as tmux; and the repo of a pane, its changed
// files and their diff, since HEAD or since the branch left the main one.

/** Images and PDFs are shown as they are; bigger files are not read. */
export const MAX_FILE = 20 * 1024 * 1024;
const MAX_DIFF = 4 * 1024 * 1024;

const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** A path for the shell: ~/ becomes "$HOME"/, the rest is quoted. */
function shPath(p: string): string {
  if (p === '~') return '"$HOME"';
  return p.startsWith('~/') ? `"$HOME"/${quote(p.slice(2))}` : quote(p);
}

/**
 * Where a path seen in a pane points: absolute and ~/ ones as they are, relative ones
 * from the pane's folder. A trailing :line(:col) is left out (the viewer gets it apart).
 */
export function resolvePath(raw: string, cwd: string): string {
  const p = raw.trim().replace(/:\d+(:\d+)?$/, '');
  if (!p || /[\0\n]/.test(p)) throw new Error('Ruta inválida');
  if (p.startsWith('/')) return posix.normalize(p);
  if (p === '~' || p.startsWith('~/')) return p;
  if (!cwd.startsWith('/')) throw new Error('No se sabe en qué carpeta está ese panel');
  return posix.resolve(cwd, p);
}

/** The folder of a pane of a window (the one asked for first, then the others), for relative paths. */
export function paneFolders(host: HostMonitor, window: string | undefined, pane: string | undefined): string[] {
  const out: string[] = [];
  const ctx = pane ? host.findPane(pane) : null;
  if (ctx?.pane.path) out.push(ctx.pane.path);
  const win = window ? host.snapshot.sessions.flatMap((s) => s.windows).find((w) => w.id === window) : ctx?.window;
  for (const p of win?.panes ?? []) if (p.path && !out.includes(p.path)) out.push(p.path);
  return out;
}

class FileError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export { FileError };

/** Runs a script on the host, its stdout as bytes (up to `max`). */
function runBytes(host: HostMonitor, script: string, max: number, timeoutMs = 30_000): Promise<{ code: number | null; out: Buffer; err: string }> {
  return new Promise((resolve, reject) => {
    const child = host.exec.spawnShell(script);
    const chunks: Buffer[] = [];
    let size = 0;
    let err = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout?.on('data', (b: Buffer) => {
      size += b.length;
      if (size > max + 64 * 1024) child.kill('SIGKILL');
      else chunks.push(b);
    });
    child.stderr?.on('data', (b: Buffer) => (err += b.toString()).length > 4000 && (err = err.slice(-4000)));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, out: Buffer.concat(chunks), err: err.trim() });
    });
  });
}

/**
 * A file of the host: the first of `paths` that is there (a relative path may be seen
 * in any pane of the window). 404 when none is, 413 when it is too big.
 */
export async function readHostFile(host: HostMonitor, paths: string[], probe = false): Promise<{ path: string; data: Buffer }> {
  const each = paths.map(shPath).join(' ');
  const script =
    `for f in ${each}; do if [ -f "$f" ]; then s=$(wc -c < "$f" | tr -d ' '); ` +
    `if [ "$s" -gt ${MAX_FILE} ]; then echo "BIG $s" >&2; exit 4; fi; ` +
    `printf '%s\\n' "$f" >&2; ${probe ? 'exit 0' : 'exec cat -- "$f"'}; ` +
    `elif [ -e "$f" ]; then echo "NOTFILE" >&2; exit 5; fi; done; echo MISSING >&2; exit 3`;
  const { code, out, err } = await runBytes(host, script, MAX_FILE);
  if (code === 3) throw new FileError(`No existe en ${host.name}`, 404);
  if (code === 4) throw new FileError(`Es demasiado grande (más de ${MAX_FILE / 1024 / 1024} MB)`, 413);
  if (code === 5) throw new FileError('No es un fichero (¿una carpeta?)', 400);
  if (code !== 0) throw new FileError(err || `No se pudo leer (código ${code})`, 500);
  const path = err.split('\n').pop() ?? paths[0];
  return { path, data: out };
}

// ---------------------------------------------------------------- git

/** The repo's main branch to compare a branch with: origin's HEAD, else main or master. */
const BASE_SCRIPT =
  `base=''; for r in "$(git symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null)" origin/main origin/master main master; do ` +
  `[ -n "$r" ] || continue; if git rev-parse -q --verify "$r^{commit}" >/dev/null 2>&1; then base=$(git merge-base HEAD "$r" 2>/dev/null) && { printf 'M\\t%s\\t%s\\n' "$r" "$base"; break; }; fi; done`;

/** NUL-separated porcelain v1: XY path (and, renamed, the old path next). */
function parseStatus(z: string): GitChange[] {
  const parts = z.split('\0');
  const out: GitChange[] = [];
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    if (entry.length < 4) continue;
    const xy = entry.slice(0, 2);
    const path = entry.slice(3);
    if (xy[0] === 'R' || xy[0] === 'C') {
      out.push({ path, status: 'R', from: parts[++i] });
      continue;
    }
    const s = xy === '??' ? '?' : xy.includes('D') ? 'D' : xy.includes('A') ? 'A' : xy.includes('U') ? 'U' : 'M';
    out.push({ path, status: s });
  }
  return out;
}

/** NUL-separated --name-status: status, path (and, renamed, both paths). */
function parseNameStatus(z: string): GitChange[] {
  const parts = z.split('\0').filter((p) => p !== '');
  const out: GitChange[] = [];
  for (let i = 0; i < parts.length; i++) {
    const s = parts[i];
    if (s[0] === 'R' || s[0] === 'C') {
      const from = parts[++i];
      out.push({ path: parts[++i], status: 'R', from });
    } else out.push({ path: parts[++i], status: (['A', 'D', 'M', 'U'].includes(s[0]) ? s[0] : 'M') as GitChange['status'] });
  }
  return out;
}

/** The changed files of the repo a pane is in: since HEAD (with untracked ones), or since the branch left the main one. */
export async function gitChanges(host: HostMonitor, cwd: string, mode: GitDiffMode): Promise<GitChanges> {
  const head =
    `cd ${shPath(cwd)} 2>/dev/null || { echo NODIR; exit 0; }; root=$(git rev-parse --show-toplevel 2>/dev/null) || { echo NOREPO; exit 0; }; cd "$root"; ` +
    `printf 'R\\t%s\\n' "$root"; printf 'B\\t%s\\n' "$(git symbolic-ref --short -q HEAD || git rev-parse --short HEAD)"; ${BASE_SCRIPT}; printf 'F\\n'; `;
  const files =
    mode === 'head'
      ? 'git status --porcelain=v1 -z --untracked-files=all'
      : `[ -n "$base" ] && git diff --no-color --name-status -z "$base"; printf '\\036'; git ls-files --others --exclude-standard -z`;
  const { out } = await runBytes(host, head + files, MAX_DIFF, 20_000);
  const text = out.toString('utf8');
  if (text.startsWith('NODIR')) throw new FileError('Esa carpeta ya no está', 404);
  if (text.startsWith('NOREPO')) throw new FileError('Ese panel no está en un repo de git', 404);
  const cut = text.indexOf('F\n');
  const header = text.slice(0, cut).split('\n');
  const body = text.slice(cut + 2);
  const res: GitChanges = { root: '', branch: '', mode, files: [] };
  for (const line of header) {
    const [k, a, b] = line.split('\t');
    if (k === 'R') res.root = a;
    else if (k === 'B') res.branch = a;
    else if (k === 'M') res.base = { ref: a, commit: b };
  }
  if (mode === 'head') res.files = parseStatus(body);
  else {
    if (!res.base) throw new FileError('No encuentro la rama principal (origin/HEAD, main o master) para comparar', 404);
    const [tracked, untracked = ''] = body.split('\x1e');
    const seen = new Set<string>();
    res.files = parseNameStatus(tracked);
    for (const f of res.files) seen.add(f.path);
    for (const p of untracked.split('\0')) if (p && !seen.has(p)) res.files.push({ path: p, status: '?' });
  }
  res.files.sort((a, b) => a.path.localeCompare(b.path));
  return res;
}

/** The diff of one file of the repo at `root` (a path inside it): since HEAD or since the branch's base commit. */
export async function gitDiff(host: HostMonitor, root: string, file: string, mode: GitDiffMode, base?: string): Promise<string> {
  if (!file || file.startsWith('/') || file.split('/').includes('..') || /[\0\n]/.test(file)) throw new FileError('Fichero inválido', 400);
  if (mode === 'branch' && !/^[0-9a-f]{7,64}$/.test(base ?? '')) throw new FileError('Falta el commit de la rama principal', 400);
  const from = mode === 'head' ? 'HEAD' : base!;
  // A file git does not know yet is all new: against /dev/null.
  const script =
    `cd ${shPath(root)} || exit 3; ` +
    `if git ls-files --error-unmatch -- ${quote(file)} >/dev/null 2>&1 || git cat-file -e ${from}:${quote(file)} 2>/dev/null; ` +
    `then git diff --no-color --no-ext-diff ${from} -- ${quote(file)}; ` +
    `else git diff --no-color --no-ext-diff --no-index -- /dev/null ${quote(file)}; fi; true`;
  const { code, out } = await runBytes(host, script, MAX_DIFF, 20_000);
  if (code === 3) throw new FileError('Ese repo ya no está', 404);
  return out.toString('utf8');
}
