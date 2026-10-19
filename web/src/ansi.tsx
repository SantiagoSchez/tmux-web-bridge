import type { CSSProperties, JSX } from 'preact';
import { ANSI, XTERM_THEME } from './theme';

/** The 256 colours: the theme's 16, the 6×6×6 cube and the grey ramp, as xterm draws them. */
const PALETTE: string[] = (() => {
  const p = [...ANSI.normal, ...ANSI.bright];
  const steps = [0, 95, 135, 175, 215, 255];
  for (const r of steps) for (const g of steps) for (const b of steps) p.push(`rgb(${r},${g},${b})`);
  for (let i = 0; i < 24; i++) p.push(`rgb(${8 + i * 10},${8 + i * 10},${8 + i * 10})`);
  return p;
})();

interface Attrs {
  fg: string | null;
  bg: string | null;
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  inverse: boolean;
  hidden: boolean;
}

const PLAIN: Attrs = { fg: null, bg: null, bold: false, dim: false, italic: false, underline: false, inverse: false, hidden: false };

/** Colour of 38/48 and their arguments: 5;n (palette) or 2;r;g;b, with ';' or ':' between them. */
function extColor(args: number[]): string | null {
  if (args[0] === 5) return PALETTE[args[1]] ?? null;
  if (args[0] === 2 && args.length >= 4) {
    const [r, g, b] = args.slice(-3);
    return `rgb(${r},${g},${b})`;
  }
  return null;
}

function applySgr(a: Attrs, raw: string): Attrs {
  a = { ...a };
  const parts = raw ? raw.split(';') : ['0'];
  for (let i = 0; i < parts.length; i++) {
    const sub = parts[i].split(':').map((x) => Number(x) || 0);
    const code = sub[0];
    if (code === 38 || code === 48 || code === 58) {
      let args = sub.slice(1);
      if (sub.length === 1) {
        // Semicolon form: the colour's arguments are the next parameters.
        const n = parts[i + 1] === '5' ? 2 : parts[i + 1] === '2' ? 4 : 0;
        args = parts.slice(i + 1, i + 1 + n).map(Number);
        i += n;
      }
      if (code === 38) a.fg = extColor(args);
      else if (code === 48) a.bg = extColor(args);
    } else if (code === 0) a = { ...PLAIN };
    else if (code === 1) a.bold = true;
    else if (code === 2) a.dim = true;
    else if (code === 3) a.italic = true;
    else if (code === 4) a.underline = sub[1] !== 0;
    else if (code === 7) a.inverse = true;
    else if (code === 8) a.hidden = true;
    else if (code === 21 || code === 22) a.bold = a.dim = false;
    else if (code === 23) a.italic = false;
    else if (code === 24) a.underline = false;
    else if (code === 27) a.inverse = false;
    else if (code === 28) a.hidden = false;
    else if (code >= 30 && code <= 37) a.fg = PALETTE[code - 30];
    else if (code === 39) a.fg = null;
    else if (code >= 40 && code <= 47) a.bg = PALETTE[code - 40];
    else if (code === 49) a.bg = null;
    else if (code >= 90 && code <= 97) a.fg = PALETTE[code - 82];
    else if (code >= 100 && code <= 107) a.bg = PALETTE[code - 92];
  }
  return a;
}

function styleOf(a: Attrs): CSSProperties | null {
  if (a === PLAIN) return null;
  let fg = a.fg;
  let bg = a.bg;
  if (a.inverse) [fg, bg] = [bg ?? XTERM_THEME.background, fg ?? XTERM_THEME.foreground];
  const s: CSSProperties = {};
  if (fg) s.color = fg;
  if (bg) s.background = bg;
  if (a.bold) s.fontWeight = 700;
  if (a.dim) s.opacity = 0.6;
  if (a.italic) s.fontStyle = 'italic';
  if (a.underline) s.textDecoration = 'underline';
  if (a.hidden) s.visibility = 'hidden';
  return Object.keys(s).length ? s : null;
}

/** ESC sequences of `capture-pane -e`: SGR (kept), OSC 8 links and anything else (dropped). */
const ESC = /\x1b(?:\[([0-9;:?]*)([@-~])|\][^\x07\x1b]*(?:\x07|\x1b\\)|[()][0-9A-Za-z]|[^[\]])/g;

/** A captured screen as text and coloured spans, for a <pre>-like element. */
export function renderAnsi(text: string): (string | JSX.Element)[] {
  const out: (string | JSX.Element)[] = [];
  let attrs = PLAIN;
  let buf = '';
  const flush = () => {
    if (!buf) return;
    const style = styleOf(attrs);
    out.push(style ? <span style={style}>{buf}</span> : buf);
    buf = '';
  };
  let last = 0;
  for (const m of text.matchAll(ESC)) {
    buf += text.slice(last, m.index);
    last = m.index + m[0].length;
    if (m[2] === 'm') {
      flush();
      attrs = applySgr(attrs, m[1]);
    }
  }
  buf += text.slice(last);
  flush();
  return out;
}
