import type { ILink, ILinkProvider, Terminal } from '@xterm/xterm';
import { findPathsInRows } from '../../shared/paths';

export interface FileLinkHandlers {
  /** Clicked or tapped: open it. */
  open: (e: MouseEvent, path: string, line?: number) => void;
  /** The mouse went onto it (a preview), and off it. */
  hover?: (e: MouseEvent, path: string, line?: number) => void;
  leave?: () => void;
}

/** How many rows above and below a path broken across rows may take. */
const SPAN = 6;

/**
 * Links on the file paths of the terminal (see shared/paths.ts), opened in the panel's
 * viewer. A tap finds them like the URLs (linkAt asks every provider). A path too long
 * for its row goes on in the next ones: its link takes all of them.
 */
export function fileLinkProvider(term: Terminal, on: FileLinkHandlers): ILinkProvider {
  /** The text of a buffer row, and the column each character of it starts at (wide ones take two). */
  const readRow = (y: number) => {
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
  };
  return {
    provideLinks(y, callback) {
      const first = Math.max(0, y - 1 - SPAN);
      const end = Math.min(term.buffer.active.length, y + SPAN);
      if (y - 1 >= end) return callback(undefined);
      const rows = Array.from({ length: end - first }, (_, k) => readRow(first + k));
      const at = (p: { row: number; i: number }) => ({ x: rows[p.row].cols[p.i] + 1, y: first + p.row + 1 });
      const links: ILink[] = findPathsInRows(rows, y - 1 - first).map((hit) => ({
        range: { start: at(hit.start), end: at(hit.last) },
        text: hit.text,
        decorations: { underline: true, pointerCursor: true },
        activate: (e) => on.open(e, hit.path, hit.line),
        hover: on.hover ? (e) => on.hover!(e, hit.path, hit.line) : undefined,
        leave: on.leave ? () => on.leave!() : undefined,
      }));
      callback(links.length ? links : undefined);
    },
  };
}
