// File paths in a line of the terminal, to open them in the panel's viewer with a tap:
// what Claude Code prints (Update(server/src/x.ts), web/app.ts:42, /tmp/shot.png,
// ~/notes/plan.md, README.md). Few false hits matter more than catching them all: a tap
// on one opens the viewer instead of focusing the terminal. URLs are not paths.

/** The extensions a bare name (no folder) needs to count as a file. */
const EXT = new Set(
  (
    'md markdown mdx txt log csv tsv json jsonc yaml yml toml ini conf cfg env xml html htm css scss sass less ' +
    'ts tsx mts cts js jsx mjs cjs vue svelte astro py rb go rs java kt kts swift c h cc cpp hpp cs php sh bash zsh fish ' +
    'sql graphql gql proto lua dart ex exs erl hs ml scala clj r jl tf hcl nix dockerfile lock gradle properties ' +
    'png jpg jpeg gif webp avif bmp ico svg pdf'
  ).split(' '),
);

export interface PathHit {
  /** Indices in the line: [start, end). */
  start: number;
  end: number;
  /** The path as written, without :line(:col). */
  path: string;
  line?: number;
}

const TOKEN = /[\w.@+~/-]+(?::\d+(?::\d+)?)?/g;

/** Whether a token (without :line) is a path worth a link. */
function isPath(p: string): boolean {
  if (p.length < 3 || p.startsWith('//') || p.endsWith('/') || p.includes('//')) return false;
  if (!/[A-Za-z]/.test(p)) return false;
  const name = p.split('/').pop()!;
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : name.toLowerCase() === 'dockerfile' || name === 'Makefile' ? 'dockerfile' : '';
  if (EXT.has(ext)) return true;
  // No known extension: only a full path (/… or ~/…) with a folder and a name.
  return /^(~|)\/[^/]+\/[^/]+/.test(p) && /^[\w.@+-]+$/.test(name) && /[A-Za-z]/.test(name);
}

export function findPaths(text: string): PathHit[] {
  const out: PathHit[] = [];
  // Words, split by spaces; one with :// in it is a URL.
  const word = /\S+/g;
  for (let w = word.exec(text); w; w = word.exec(text)) {
    if (w[0].includes('://')) continue;
    TOKEN.lastIndex = 0;
    for (let m = TOKEN.exec(w[0]); m; m = TOKEN.exec(w[0])) {
      let tok = m[0];
      let lead = 0;
      // Sentence punctuation around it is not part of it.
      while (/^[.-]/.test(tok) && !/^\.{1,2}\//.test(tok)) {
        tok = tok.slice(1);
        lead++;
      }
      tok = tok.replace(/[.,-]+$/, '');
      const lm = /:(\d+)(?::\d+)?$/.exec(tok);
      const path = lm ? tok.slice(0, lm.index) : tok;
      if (!isPath(path)) continue;
      const start = w.index + m.index + lead;
      out.push({ start, end: start + tok.length, path, line: lm ? Number(lm[1]) : undefined });
    }
  }
  return out;
}

/** A row of the terminal, for paths that go on in the next one. */
export interface Row {
  text: string;
  /** Its text reaches the edge (Claude Code breaks a column before it), so a word may go on below. */
  full: boolean;
}

export interface RowPathHit {
  path: string;
  line?: number;
  /** The path as written, :line included (a broken one, joined). */
  text: string;
  /** Where it starts and where its last character is: a row, and an index in its text. */
  start: { row: number; i: number };
  last: { row: number; i: number };
}

const PATH_CHAR = /[\w.@+~/-]/;

/** Whether a word at the end of `row` goes on at the start of `next` (indent aside). */
function goesOn(row: Row, next: Row): boolean {
  return row.full && PATH_CHAR.test(row.text.trimEnd().slice(-1)) && PATH_CHAR.test(next.text.trimStart().charAt(0));
}

/**
 * The paths on rows[at], also those too long for one row: the terminal (or Claude Code,
 * which indents what follows) breaks them where the row ends, with no space. A broken path
 * wins over the pieces of it that look like one; a path that just ends at the edge, before
 * an unrelated word, stays as it is.
 */
export function findPathsInRows(rows: Row[], at: number): RowPathHit[] {
  let lo = at;
  let hi = at;
  while (lo > 0 && goesOn(rows[lo - 1], rows[lo])) lo--;
  while (hi < rows.length - 1 && goesOn(rows[hi], rows[hi + 1])) hi++;

  // The rows joined, and where each character of it comes from.
  let joined = '';
  const from: { row: number; i: number }[] = [];
  for (let r = lo; r <= hi; r++) {
    const text = rows[r].text;
    const first = r === lo ? 0 : text.length - text.trimStart().length;
    const end = r === hi ? text.length : text.trimEnd().length;
    for (let i = first; i < end; i++) from.push({ row: r, i });
    joined += text.slice(first, end);
  }
  const broken = findPaths(joined)
    .map((h) => ({ path: h.path, line: h.line, text: joined.slice(h.start, h.end), start: from[h.start], last: from[h.end - 1] }))
    .filter((h) => h.start.row !== h.last.row);

  const out = broken.filter((h) => h.start.row <= at && at <= h.last.row);
  // The row's own paths, but not the pieces of a broken one.
  for (const h of findPaths(rows[at].text)) {
    const overlaps = out.some((b) => {
      const s = b.start.row === at ? b.start.i : 0;
      const e = b.last.row === at ? b.last.i : Infinity;
      return h.start <= e && s <= h.end - 1;
    });
    if (!overlaps) out.push({ path: h.path, line: h.line, text: rows[at].text.slice(h.start, h.end), start: { row: at, i: h.start }, last: { row: at, i: h.end - 1 } });
  }
  return out;
}
