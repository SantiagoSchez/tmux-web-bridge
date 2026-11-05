/**
 * What is copied from the terminal, cleaned up for pasting elsewhere.
 *
 * Claude Code breaks its text to the width of the terminal with real line breaks
 * (neither tmux nor xterm can tell them from the ones it meant), draws quotes with a
 * «▎ » before each line, and starts its answers with «● » and two spaces of indent
 * on the lines that follow. This puts the paragraphs back together and drops those.
 */

/** A quote's bar (Claude Code draws «▎», other tools «▌»), with the space after it. */
const QUOTE = /^([ \t]*)[▎▌](?: |$)/;
/** Claude Code's mark before each message and tool call. */
const BULLET = /^[●⏺] /;
/** A line that starts something of its own: a list item, a heading, a fence, a tool's output... */
const STARTS_BLOCK = /^(?:[-*+•]\s|\d{1,9}[.)]\s|#{1,6}\s|>\s|```|~~~|[⎿|])/;
/** Lines drawn with box characters (rules, tables, frames) are never paragraphs. */
const BOX = /[─━│┃┌┐└┘├┤┬┴┼╭╮╯╰═║╔╗╚╝]/;
/** Characters two cells wide: CJK, Hangul, fullwidth forms and most emoji. */
const WIDE =
  /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{1F300}-\u{1F64F}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{20000}-\u{3FFFD}]/u;
const ZERO = /[\p{M}​-‏︀-️]/u;

/** The cells a string takes in the terminal. */
export function cellWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += ZERO.test(ch) ? 0 : WIDE.test(ch) ? 2 : 1;
  return w;
}

interface Line {
  text: string;
  /** Cells from the left edge of the terminal to the end of the line, as it was on screen. */
  end: number;
  /** Cells before the text (its indent on screen); null when the copy started mid-line. */
  indent: number | null;
  quoted: boolean;
  /** A message's first line (it had «● »): it never continues the line before. */
  bullet: boolean;
}

const leading = (s: string) => s.length - s.trimStart().length;

/**
 * @param cols the terminal's width.
 * @param firstCol the column where the copy started, when it is known; unknown, a first
 *   line without indent under indented ones is taken for the end of a longer one.
 */
export function cleanCopy(text: string, cols: number, firstCol?: number): string {
  const raw = text.replace(/\r\n?/g, '\n').split('\n');
  const lines: Line[] = raw.map((r, i) => {
    let s = r.trimEnd();
    const start = i === 0 ? (firstCol ?? 0) : 0;
    const end = start + cellWidth(s);
    const bullet = start === 0 && BULLET.test(s);
    // The bullet takes the place of the indent the following lines have.
    if (bullet) s = '  ' + s.slice(2);
    const q = QUOTE.exec(s);
    if (q && !s.slice(q[0].length).includes(s[q[1].length])) s = q[1] + s.slice(q[0].length);
    return { text: s, end, indent: start + leading(s), quoted: !!q, bullet };
  });

  // Copied from the middle of a line with no column to go by: under indented lines (Claude's
  // text always is), a first line without it is the end of a longer one, which ran to the edge.
  const first = lines[0];
  const guessFirst =
    firstCol === undefined &&
    lines.length > 1 &&
    first.text !== '' &&
    leading(first.text) === 0 &&
    lines.slice(1).some((l) => l.text && leading(l.text) > 0);
  if (guessFirst || (firstCol ?? 0) > 0) first.indent = null;
  if (guessFirst) first.end = cols;

  // The indent every line shares goes; the one some have over the others (lists, code) stays.
  const indents = lines.filter((l) => l.text && l.indent !== null).map((l) => l.indent!);
  const common = indents.length ? Math.min(...indents) : 0;
  for (const l of lines) {
    if (l.indent === null) l.text = l.text.trimStart();
    else l.text = l.text.slice(Math.min(common, leading(l.text)));
  }

  const out: string[] = [];
  let prev: Line | undefined;
  for (const l of lines) {
    if (prev && continues(prev, l, cols)) {
      const word = l.text.trimStart();
      // A word too long for a line is broken where the line ends, without a space.
      const broken = !/\s/.test(prev.text.trim()) && prev.end >= cols - 1;
      out[out.length - 1] = out[out.length - 1] + (broken ? '' : ' ') + word;
    } else {
      out.push(l.text);
    }
    prev = l;
  }
  return out.join('\n');
}

/** Whether `next` is the same paragraph as `line`, broken only because it ran out of width. */
function continues(line: Line, next: Line, cols: number): boolean {
  const body = next.text.trimStart();
  if (!line.text.trim() || !body || next.bullet || line.quoted !== next.quoted) return false;
  if (STARTS_BLOCK.test(body) || BOX.test(line.text) || BOX.test(next.text)) return false;
  // Less indented than the line before: out of a list item, or of a block.
  if (line.indent !== null && next.indent! < line.indent) return false;
  // Claude Code breaks a column before the edge: the next word did not fit in what was left.
  const word = body.split(/\s/, 1)[0];
  return line.end + 1 + cellWidth(word) > cols - 1;
}
