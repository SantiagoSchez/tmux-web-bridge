import type { ILink, ILinkProvider, Terminal } from '@xterm/xterm';
import { findPaths } from '../../shared/paths';

/**
 * Links on the file paths of the terminal (see shared/paths.ts), opened in the panel's
 * viewer. A tap finds them like the URLs (linkAt asks every provider).
 */
export function fileLinkProvider(term: Terminal, open: (e: MouseEvent, path: string, line?: number) => void): ILinkProvider {
  return {
    provideLinks(y, callback) {
      const line = term.buffer.active.getLine(y - 1);
      if (!line) return callback(undefined);
      // The text of the row, and the column each character of it starts at (wide ones take two).
      let text = '';
      const cols: number[] = [];
      for (let x = 0; x < term.cols; x++) {
        const cell = line.getCell(x);
        if (!cell) break;
        if (cell.getWidth() === 0) continue;
        const chars = cell.getChars() || ' ';
        for (let i = 0; i < chars.length; i++) cols.push(x);
        text += chars;
      }
      const links: ILink[] = findPaths(text).map((hit) => ({
        range: { start: { x: cols[hit.start] + 1, y }, end: { x: cols[hit.end - 1] + 1, y } },
        text: text.slice(hit.start, hit.end),
        decorations: { underline: true, pointerCursor: true },
        activate: (e) => open(e, hit.path, hit.line),
      }));
      callback(links.length ? links : undefined);
    },
  };
}
