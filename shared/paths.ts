// File and folder paths in a line of the terminal, to open them in the panel's viewer with
// a tap: what Claude Code prints (Update(server/src/x.ts), web/app.ts:42, /tmp/shot.png,
// ~/notes/plan.md, README.md, ~/videos/render/). Few false hits matter more than catching
// them all: a tap on one opens the viewer instead of focusing the terminal. URLs are not
// paths. Also where a hyperlink (OSC 8) leads, when it is a file of the machine.

/** The extensions a bare name (no folder) needs to count as a file. */
const EXT = new Set(
  (
    'md markdown mdx txt log csv tsv json jsonc yaml yml toml ini conf cfg env xml html htm css scss sass less ' +
    'ts tsx mts cts js jsx mjs cjs vue svelte astro py rb go rs java kt kts swift c h cc cpp hpp cs php sh bash zsh fish ' +
    'sql graphql gql proto lua dart ex exs erl hs ml scala clj r jl tf hcl nix dockerfile lock gradle properties ' +
    'png jpg jpeg gif webp avif bmp ico svg pdf mp4 m4v mov webm mkv ogv mp3 m4a aac wav ogg oga opus flac'
  ).split(' '),
);

export interface PathHit {
  /** Indices in the line: [start, end). */
  start: number;
  end: number;
  /** The path as written, without :line(:col). */
  path: string;
  line?: number;
  /** A folder (it ends with /): the explorer opens it. */
  dir: boolean;
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

/**
 * Whether a token that ends with / is a folder worth a link: a name of two characters or
 * more with a letter at its end (not `a/` nor `y/o/`), and nothing but path characters
 * between its slashes. `/` and `~/` alone are not.
 */
function isFolder(p: string): boolean {
  const body = p.slice(0, -1).replace(/^(~\/|\.{1,2}\/|\/)/, '');
  if (!body || body.includes('//')) return false;
  const parts = body.split('/');
  const name = parts[parts.length - 1];
  return name.length >= 2 && /[A-Za-z]/.test(name) && parts.every((s) => /^[\w.@+-]+$/.test(s));
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
      const dir = path.endsWith('/');
      if (dir ? !isFolder(path) : !isPath(path)) continue;
      const start = w.index + m.index + lead;
      out.push({ start, end: start + tok.length, path, line: lm ? Number(lm[1]) : undefined, dir });
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
  dir: boolean;
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
    .map((h) => ({ path: h.path, line: h.line, dir: h.dir, text: joined.slice(h.start, h.end), start: from[h.start], last: from[h.end - 1] }))
    .filter((h) => h.start.row !== h.last.row);

  const out = broken.filter((h) => h.start.row <= at && at <= h.last.row);
  // Words broken across rows that are a path, even one that is not a link (a folder): their
  // pieces are not paths either. One that goes on with a plain word (README.md, then
  // «antes») is two words that happened to meet at the edge.
  const pieces: { start: { row: number; i: number }; last: { row: number; i: number } }[] = [...out];
  const word = /\S+/g;
  for (let w = word.exec(joined); w; w = word.exec(joined)) {
    const start = from[w.index];
    const last = from[w.index + w[0].length - 1];
    if (start.row > at || last.row < at || start.row === last.row) continue;
    const head = w[0].slice(0, from.slice(w.index).findIndex((f) => f.row !== start.row));
    const tail = w[0].slice(head.length);
    if (tail.includes('/') || /^[-._/]/.test(tail) || /[-._/]$/.test(head)) pieces.push({ start, last });
  }
  // The row's own paths, but not the pieces of a broken one.
  for (const h of findPaths(rows[at].text)) {
    const overlaps = pieces.some((b) => {
      const s = b.start.row === at ? b.start.i : 0;
      const e = b.last.row === at ? b.last.i : Infinity;
      return h.start <= e && s <= h.end - 1;
    });
    if (!overlaps) out.push({ path: h.path, line: h.line, dir: h.dir, text: rows[at].text.slice(h.start, h.end), start: { row: at, i: h.start }, last: { row: at, i: h.end - 1 } });
  }
  return out;
}

/** Where a hyperlink to a file of the machine leads: the path as a link of the terminal would give it. */
export interface FileTarget {
  path: string;
  line?: number;
  /** It ends with /: the explorer opens it. */
  dir: boolean;
}

/** Percent-decoded (Markdown writes spaces and accents that way); as it is when it is not valid encoding. */
function decoded(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Where a hyperlink (OSC 8) leads when it is a file of the machine, or null when it goes
 * elsewhere (a web page, a mail address). A file:// URL gives its path (its host, if any,
 * is the pane's machine anyway); a path without a scheme (/…, ~/…, relative) is that path.
 * A :N or #LN at its end is the line.
 */
export function fileTarget(uri: string): FileTarget | null {
  let raw = uri.trim();
  const file = /^file:(?:\/\/[^/]*)?(\/.*)$/i.exec(raw);
  // A file URL's query means nothing for a file of the machine.
  if (file) raw = file[1].replace(/\?[^#]*/, '');
  // A scheme: letters, then a colon not followed by a line number (notes.md:3 is a file).
  else if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(raw)) return null;
  // A Markdown heading (#instalacion), not a line (#L12) nor a # of the name (issue#12.md).
  raw = raw.replace(/#(?!L\d+$)[^#./]*$/, '');
  const lm = /(?::(\d+)(?::\d+)?|#L(\d+))$/.exec(raw);
  const path = decoded(lm ? raw.slice(0, lm.index) : raw);
  if (!path) return null;
  const dir = path.endsWith('/');
  return lm ? { path, line: Number(lm[1] ?? lm[2]), dir } : { path, dir };
}


/** What tapping a hyperlink (OSC 8) does: a web page in a new tab, a file in the viewer, a folder in the explorer. */
export type HyperlinkTarget = { kind: 'web'; url: string } | { kind: 'file'; path: string; line?: number } | { kind: 'dir'; path: string };

/**
 * What a hyperlink a program wrote in the terminal opens; null for any other scheme
 * (javascript:, data:, mailto:…), which the panel must never open: the terminal lets any
 * program write one, and the panel's page controls every machine.
 */
export function hyperlinkTarget(uri: string): HyperlinkTarget | null {
  const url = uri.trim();
  if (/^https?:\/\//i.test(url)) return { kind: 'web', url };
  const t = fileTarget(url);
  if (!t) return null;
  if (t.dir) return { kind: 'dir', path: t.path };
  return t.line ? { kind: 'file', path: t.path, line: t.line } : { kind: 'file', path: t.path };
}
