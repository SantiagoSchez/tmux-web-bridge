import type { ILink, ILinkProvider, Terminal } from '@xterm/xterm';
import { findRefs, refUrl, type RefHit } from '../../shared/refs';
import type { RefContext } from '../../shared/types';
import { api } from './api';
import { readRow } from './fileLinks';
import type { FileOrigin } from './fileViewer';
import { findWindow } from './state';

// Links on what agents write in the terminal: PR #12, Issue #3, pipeline #9 and Trello #470
// (their page, from the pane's project), and Claude Code's [Image #N] (the pasted image, in
// the viewer). A tap asks the providers synchronously, so the project is read ahead of it.

/** How long what a project lets link is kept: a new koalarnes.json shows up within this time. */
const CONTEXT_TTL = 5 * 60_000;

/** Per host and folder: what its project lets link once read, and the read while it is on its way. */
const contexts = new Map<string, { at: number; ctx?: RefContext; pending?: Promise<RefContext | undefined> }>();

/** The pane's folder, which decides the project. */
function paneFolder(origin: FileOrigin): string | undefined {
  if (!origin.window) return undefined;
  return findWindow(origin.host, origin.window)?.window.panes.find((p) => p.id === origin.pane)?.path;
}

/**
 * What the pane's project lets link: at once when already read, else the read on its way
 * (started here if needed; undefined when the machine does not answer). A tap only sees
 * the first case: the terminal reads it ahead (prefetchRefContext).
 */
function contextOf(origin: FileOrigin): RefContext | Promise<RefContext | undefined> | undefined {
  const folder = paneFolder(origin);
  if (!folder) return undefined;
  const key = `${origin.host}\t${folder}`;
  const known = contexts.get(key);
  if (known && Date.now() - known.at < CONTEXT_TTL) return known.ctx ?? known.pending;
  const q = new URLSearchParams({ host: origin.host, ...(origin.window ? { window: origin.window } : {}), ...(origin.pane ? { pane: origin.pane } : {}) });
  const pending = api<RefContext>(`/api/refs/context?${q}`).then(
    (ctx) => {
      contexts.set(key, { at: Date.now(), ctx });
      return ctx;
    },
    () => {
      // The machine did not answer: asked again on the next look instead of waiting five minutes.
      contexts.delete(key);
      return undefined;
    },
  );
  contexts.set(key, { at: Date.now(), pending });
  return pending;
}

/** Reads what the pane's project lets link before anything is tapped (the terminal opens, or moves to another pane). */
export function prefetchRefContext(origin: FileOrigin): void {
  contextOf(origin);
}

/** The links of one row (1-based y) for the hits a handler wants, each covering its text. */
function rowLinks(term: Terminal, y: number, make: (hit: RefHit) => Omit<ILink, 'range' | 'text'> | undefined): ILink[] | undefined {
  const row = readRow(term, y - 1);
  const links: ILink[] = [];
  for (const hit of findRefs(row.text)) {
    const link = make(hit);
    if (!link) continue;
    links.push({ range: { start: { x: row.cols[hit.start] + 1, y }, end: { x: row.cols[hit.end - 1] + 1, y } }, text: row.text.slice(hit.start, hit.end), ...link });
  }
  return links.length ? links : undefined;
}

export interface RefLinkHandlers {
  /** A pull request, issue or pipeline: its page. */
  open: (e: MouseEvent, url: string) => void;
  /** A Trello card: looked up on the hub by its board and number. */
  trello: (e: MouseEvent, board: string, n: number) => void;
}

/** Links on PR #N, Issue #N, pipeline #N and Trello #N, only where the pane's project can resolve them. */
export function refLinkProvider(term: Terminal, origin: () => FileOrigin, on: RefLinkHandlers): ILinkProvider {
  return {
    provideLinks(y, callback) {
      const text = readRow(term, y - 1).text;
      if (!findRefs(text).some((h) => h.kind !== 'image')) return callback(undefined);
      const links = (ctx: RefContext | undefined) =>
        ctx &&
        rowLinks(term, y, (hit) => {
          const decorations = { underline: true, pointerCursor: true };
          if (hit.kind === 'trello') {
            const board = ctx.trelloBoard;
            return board ? { decorations, activate: (e) => on.trello(e, board, hit.n) } : undefined;
          }
          const url = ctx.repo && refUrl(hit.kind, hit.n, ctx.repo);
          return url ? { decorations, activate: (e) => on.open(e, url) } : undefined;
        });
      const ctx = contextOf(origin());
      // Still on its way: xterm keeps the answer while the mouse stays on the row, so it waits for it.
      if (ctx instanceof Promise) void ctx.then((c) => callback(links(c)));
      else callback(links(ctx));
    },
  };
}

export interface ImageLinkHandlers {
  open: (e: MouseEvent, n: number) => void;
  /** The mouse went onto it (a preview), and off it. */
  hover: (e: MouseEvent, n: number) => void;
  leave: () => void;
}

/** Links on Claude Code's [Image #N]: the image as Claude Code saved it, in the viewer. */
export function imageLinkProvider(term: Terminal, on: ImageLinkHandlers): ILinkProvider {
  return {
    provideLinks(y, callback) {
      callback(
        rowLinks(term, y, (hit) =>
          hit.kind === 'image'
            ? { decorations: { underline: true, pointerCursor: true }, activate: (e) => on.open(e, hit.n), hover: (e) => on.hover(e, hit.n), leave: on.leave }
            : undefined,
        ),
      );
    },
  };
}
