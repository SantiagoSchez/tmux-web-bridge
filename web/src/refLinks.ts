import type { ILink, ILinkProvider, Terminal } from '@xterm/xterm';
import { findRefs, refUrl, type RefHit } from '../../shared/refs';
import { StaleCache } from '../../shared/stale-cache';
import type { RefContext } from '../../shared/types';
import { api } from './api';
import { readRow, screenCell, type ScreenCell } from './fileLinks';
import type { FileOrigin } from './fileViewer';
import { findWindow } from './state';

// Links on what agents write in the terminal: PR #12, Issue #3, pipeline #9 and Trello #470
// (their page, from the project of the pane they are written in), and Claude Code's
// [Image #N] (the pasted image, in the viewer). A tap asks the providers synchronously, so
// the project is read ahead of it.

/** How long what a project lets link holds: a new koalarnes.json shows up on the first look after it. */
const CONTEXT_TTL = 5 * 60_000;

/** Per host and folder, what its project lets link. An expired one keeps answering while it is read again. */
const contexts = new StaleCache<RefContext>(CONTEXT_TTL);

/** The pane's folder, which decides the project. */
function paneFolder(origin: FileOrigin): string | undefined {
  if (!origin.window) return undefined;
  return findWindow(origin.host, origin.window)?.window.panes.find((p) => p.id === origin.pane)?.path;
}

/**
 * What the pane's project lets link: at once once read, else the read on its way
 * (undefined when the machine does not answer). A tap only sees the first case: the
 * terminal reads it ahead (prefetchRefContext).
 */
function contextOf(origin: FileOrigin): RefContext | Promise<RefContext | undefined> | undefined {
  const folder = paneFolder(origin);
  if (!folder) return undefined;
  const q = new URLSearchParams({ host: origin.host, ...(origin.window ? { window: origin.window } : {}), ...(origin.pane ? { pane: origin.pane } : {}) });
  const read = contexts.get(`${origin.host}\t${folder}`, () => api<RefContext>(`/api/refs/context?${q}`));
  return read.ready ? read.value : read.pending;
}

/** Reads what a pane's project lets link before anything is tapped (the terminal opens, or its panes change). */
export function prefetchRefContext(origin: FileOrigin): void {
  contextOf(origin);
}

type RowText = ReturnType<typeof readRow>;

/** The link of one hit in a row (1-based y), covering its text. */
function hitLink(row: RowText, y: number, hit: RefHit, link: Omit<ILink, 'range' | 'text'>): ILink {
  return { range: { start: { x: row.cols[hit.start] + 1, y }, end: { x: row.cols[hit.end - 1] + 1, y } }, text: row.text.slice(hit.start, hit.end), ...link };
}

export interface RefLinkHandlers {
  /** A pull request, issue or pipeline: its page. */
  open: (e: MouseEvent, url: string) => void;
  /** A Trello card: looked up on the hub by its board and number. */
  trello: (e: MouseEvent, board: string, n: number) => void;
}

/**
 * Links on PR #N, Issue #N, pipeline #N and Trello #N, only where the project of the pane
 * each one is written in (origin of its first cell) can resolve them.
 */
export function refLinkProvider(term: Terminal, origin: (cell: ScreenCell) => FileOrigin, on: RefLinkHandlers): ILinkProvider {
  return {
    provideLinks(y, callback) {
      const row = readRow(term, y - 1);
      const hits = findRefs(row.text).filter((h) => h.kind !== 'image');
      if (!hits.length) return callback(undefined);
      const reads = hits.map((hit) => contextOf(origin(screenCell(term, y - 1, row.cols[hit.start]))));
      const decorations = { underline: true, pointerCursor: true };
      const links = (ctxs: (RefContext | undefined)[]) => {
        const out: ILink[] = [];
        hits.forEach((hit, i) => {
          const ctx = ctxs[i];
          if (!ctx) return;
          if (hit.kind === 'trello') {
            const board = ctx.trelloBoard;
            if (board) out.push(hitLink(row, y, hit, { decorations, activate: (e) => on.trello(e, board, hit.n) }));
            return;
          }
          const url = ctx.repo && refUrl(hit.kind, hit.n, ctx.repo);
          if (url) out.push(hitLink(row, y, hit, { decorations, activate: (e) => on.open(e, url) }));
        });
        return out.length ? out : undefined;
      };
      // A read still on its way: xterm keeps the answer while the mouse stays on the row, so it waits for it.
      if (reads.some((r) => r instanceof Promise)) void Promise.all(reads).then((ctxs) => callback(links(ctxs)));
      else callback(links(reads as (RefContext | undefined)[]));
    },
  };
}

export interface ImageLinkHandlers {
  open: (e: MouseEvent, n: number, cell: ScreenCell) => void;
  /** The mouse went onto it (a preview), and off it. */
  hover: (e: MouseEvent, n: number, cell: ScreenCell) => void;
  leave: () => void;
}

/** Links on Claude Code's [Image #N]: the image as Claude Code saved it, in the viewer. */
export function imageLinkProvider(term: Terminal, on: ImageLinkHandlers): ILinkProvider {
  return {
    provideLinks(y, callback) {
      const row = readRow(term, y - 1);
      const links = findRefs(row.text)
        .filter((hit) => hit.kind === 'image')
        .map((hit) => {
          const cell = screenCell(term, y - 1, row.cols[hit.start]);
          return hitLink(row, y, hit, {
            decorations: { underline: true, pointerCursor: true },
            activate: (e) => on.open(e, hit.n, cell),
            hover: (e) => on.hover(e, hit.n, cell),
            leave: on.leave,
          });
        });
      callback(links.length ? links : undefined);
    },
  };
}
