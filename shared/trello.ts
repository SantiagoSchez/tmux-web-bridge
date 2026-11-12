// What the hub, the panel and the Trello extension share about launching a Claude on a
// Trello card: the prompt template, the board's Doing list, where a task can go and the
// comment left on the card. The extension bundles this file; the rest import it.

import type { ExtHostTargets, ExtLaunchResult, ExtLaunchTarget, TrelloCard } from './types.js';

export const DEFAULT_TEMPLATE = 'Haz la tarjeta {url}';

/** The prompt from the template: {url}, {name}, {shortLink} and {board} of the card; anything else stays. */
export function renderTemplate(template: string, card: Pick<TrelloCard, 'url' | 'name' | 'shortLink' | 'board'>): string {
  const vars: Record<string, string> = { url: card.url, name: card.name, shortLink: card.shortLink, board: card.board.name };
  return template.replace(/\{(url|name|shortLink|board)\}/g, (_, k: string) => vars[k]);
}

/** A list name without emoji or punctuation, lower case: "⚙ Doing" → "doing". */
function plain(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** The board's Doing list: one called just that (emoji aside), or else the first one with "doing" in its name. */
export function findDoingList<T extends { name: string; closed?: boolean }>(lists: T[]): T | undefined {
  const open = lists.filter((l) => !l.closed);
  return open.find((l) => plain(l.name) === 'doing') ?? open.find((l) => /\bdoing\b/.test(plain(l.name)));
}

/** The space twb opens for a folder: tmux rejects '.' and ':' in session names. */
export function spaceName(name: string): string {
  return name.replace(/[.:]/g, '-').trim();
}

/** One choice of the destination list. */
export interface Destination {
  /** Stable across restarts (a space by its name, a folder by its path), for remembering it. */
  key: string;
  label: string;
  target: ExtLaunchTarget;
}

export interface DestinationGroup {
  label: string;
  items: Destination[];
}

/**
 * Where a task can go on a machine: its open spaces first, then the folders of
 * «Nuevo space» (each with subfolders as a group of its own, the loose ones together).
 */
export function destinations(host: ExtHostTargets): DestinationGroup[] {
  const open = new Set(host.spaces.map((s) => s.name));
  const tag = (name: string) => (open.has(spaceName(name)) ? ' · abierto' : '');
  const groups: DestinationGroup[] = [];
  const spaces = [...host.spaces].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  if (spaces.length) {
    groups.push({
      label: 'Spaces abiertos (ventana nueva)',
      items: spaces.map((s) => ({ key: `space:${s.name}`, label: s.name, target: { session: s.id } })),
    });
  }
  const loose: Destination[] = [];
  for (const f of host.folders ?? []) {
    if (f.missing) continue;
    if (f.subfolders) {
      if (!f.children.length) continue;
      groups.push({
        label: `${f.name} (carpetas)`,
        items: f.children.map((c) => ({ key: `sub:${f.path}\n${c}`, label: `${c}${tag(c)}`, target: { folder: f.path, sub: c } })),
      });
    } else {
      loose.push({ key: `folder:${f.path}`, label: `${f.name}${tag(f.name)}`, target: { folder: f.path } });
    }
  }
  if (loose.length) groups.push({ label: 'Carpetas', items: loose });
  return groups;
}

/** The comment left on the card. */
export function commentText(r: Pick<ExtLaunchResult, 'hostName' | 'space' | 'windowName'>): string {
  return `🤖 Lanzada en ${r.hostName} › ${r.space} · ventana «${r.windowName}»`;
}
