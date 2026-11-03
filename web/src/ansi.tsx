import type { CSSProperties, JSX } from 'preact';
import { TERM_THEMES, type Appearance } from './theme';

/** The 256 colours: the theme's 16, the 6×6×6 cube and the grey ramp, as xterm draws them. */
function palette(theme: Appearance): string[] {
  const { ansi } = TERM_THEMES[theme];
  const p = [...ansi.normal, ...ansi.bright];
  const steps = [0, 95, 135, 175, 215, 255];
  for (const r of steps) for (const g of steps) for (const b of steps) p.push(`rgb(${r},${g},${b})`);
  for (let i = 0; i < 24; i++) p.push(`rgb(${8 + i * 10},${8 + i * 10},${8 + i * 10})`);
  return p;
}
const PALETTES: Record<Appearance, string[]> = { dark: palette('dark'), light: palette('light') };
/** The palette of the screen being rendered (renderAnsi is synchronous). */
let PALETTE = PALETTES.dark;
let XTERM_THEME = TERM_THEMES.dark.xterm;
let MIN_CONTRAST = TERM_THEMES.dark.minContrast;

function rgbOf(c: string): [number, number, number] {
  if (c.startsWith('#')) return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as [number, number, number];
  const m = c.match(/\d+/g) ?? ['0', '0', '0'];
  return [Number(m[0]), Number(m[1]), Number(m[2])];
}

function luminance([r, g, b]: [number, number, number]): number {
  const l = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * l(r) + 0.7152 * l(g) + 0.0722 * l(b);
}

function contrast(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const readable = new Map<string, string>();

/** Like xterm's minimumContrastRatio: the text colour pushed toward black or white until it reads on its background. */
function ensureContrast(fg: string, bg: string): string {
  const key = `${fg}|${bg}|${MIN_CONTRAST}`;
  let out = readable.get(key);
  if (out) return out;
  const f = rgbOf(fg);
  const lb = luminance(rgbOf(bg));
  const target = lb > 0.5 ? 0 : 255;
  out = fg;
  for (let t = 0.1; contrast(luminance(rgbOf(out)), lb) < MIN_CONTRAST && t <= 1.001; t += 0.1) {
    out = `rgb(${f.map((v) => Math.round(v + (target - v) * t)).join(',')})`;
  }
  readable.set(key, out);
  return out;
}

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
  if (MIN_CONTRAST > 1 && (fg || bg)) {
    const shown = ensureContrast(fg ?? XTERM_THEME.foreground, bg ?? XTERM_THEME.background);
    if (fg || shown !== XTERM_THEME.foreground) fg = shown;
  }
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
export function renderAnsi(text: string, theme: Appearance): (string | JSX.Element)[] {
  PALETTE = PALETTES[theme];
  XTERM_THEME = TERM_THEMES[theme].xterm;
  MIN_CONTRAST = TERM_THEMES[theme].minContrast;
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
