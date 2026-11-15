import type { ILink, ILinkProvider, Terminal } from '@xterm/xterm';
import { findPathsInRows } from '../../shared/paths';

/** A cell of the terminal's screen (0-based), where a link starts: which pane it belongs to. */
export interface ScreenCell {
  col: number;
  row: number;
}

/** The screen cell of a column of a buffer row (0-based both). */
export function screenCell(term: Terminal, y: number, col: number): ScreenCell {
  return { col, row: y - term.buffer.active.baseY };
}

export interface FileLinkHandlers {
  /** Clicked or tapped: open it. */
  open: (e: MouseEvent, path: string, line: number | undefined, cell: ScreenCell) => void;
  /** The mouse went onto it (a preview), and off it. */
  hover?: (e: MouseEvent, path: string, line: number | undefined, cell: ScreenCell) => void;
  leave?: () => void;
}

/** How many rows above and below a path broken across rows may take. */
const SPAN = 6;

/**
 * The text of a buffer row (0-based), the column each character of it starts at (wide
 * ones take two), and whether it reaches the right edge (its text may go on below).
 */
export function readRow(term: Terminal, y: number): { text: string; cols: number[]; full: boolean } {
  const line = term.buffer.active.getLine(y);
  let text = '';
  const cols: number[] = [];
  let last = -1;
  for (let x = 0; line && x < term.cols; x++) {
    const cell = line.getCell(x);
    if (!cell) break;
    if (cell.getWidth() === 0) continue;
    const chars = cell.getChars() || ' ';
    for (let i = 0; i < chars.length; i++) cols.push(x);
    text += chars;
    if (chars.trim()) last = x + cell.getWidth() - 1;
  }
  return { text, cols, full: last >= term.cols - 2 };
}

/**
 * Links on the file paths of the terminal (see shared/paths.ts), opened in the panel's
 * viewer. A tap finds them like the URLs (linkAt asks every provider). A path too long
 * for its row goes on in the next ones: its link takes all of them.
 */
export function fileLinkProvider(term: Terminal, on: FileLinkHandlers): ILinkProvider {
  return {
    provideLinks(y, callback) {
      const first = Math.max(0, y - 1 - SPAN);
      const end = Math.min(term.buffer.active.length, y + SPAN);
      if (y - 1 >= end) return callback(undefined);
      const rows = Array.from({ length: end - first }, (_, k) => readRow(term, first + k));
      const at = (p: { row: number; i: number }) => ({ x: rows[p.row].cols[p.i] + 1, y: first + p.row + 1 });
      const links: ILink[] = findPathsInRows(rows, y - 1 - first).map((hit) => {
        const cell = screenCell(term, first + hit.start.row, rows[hit.start.row].cols[hit.start.i]);
        return {
          range: { start: at(hit.start), end: at(hit.last) },
          text: hit.text,
          decorations: { underline: true, pointerCursor: true },
          activate: (e) => on.open(e, hit.path, hit.line, cell),
          hover: on.hover ? (e) => on.hover!(e, hit.path, hit.line, cell) : undefined,
          leave: on.leave ? () => on.leave!() : undefined,
        };
      });
      callback(links.length ? links : undefined);
    },
  };
}
