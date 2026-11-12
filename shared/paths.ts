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
