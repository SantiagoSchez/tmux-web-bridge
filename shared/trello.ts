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

/** One folder of the destination's folder list. */
export interface Destination {
  /** Stable across restarts (a folder by its path), for remembering it. */
  key: string;
  label: string;
  target: { folder: string; sub?: string };
}

export interface DestinationGroup {
  label: string;
  items: Destination[];
}

/** One open space of the destination's space list. */
export interface SpaceChoice {
  /** Stable across restarts (a space by its name), for remembering it. */
  key: string;
  label: string;
  id: string;
}

/** The open spaces a task can get a new window in, by name. */
export function spaceChoices(host: ExtHostTargets): SpaceChoice[] {
  return [...host.spaces]
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
    .map((s) => ({ key: `space:${s.name}`, label: s.name, id: s.id }));
}

/**
 * The folders of «Nuevo space» a task can go in: each with subfolders as a group of its
 * own, the loose ones together. With `tagOpen`, those whose space is open say so.
 */
export function folderGroups(host: ExtHostTargets, tagOpen = true): DestinationGroup[] {
  const open = new Set(host.spaces.map((s) => s.name));
  const tag = (name: string) => (tagOpen && open.has(spaceName(name)) ? ' · abierto' : '');
  const groups: DestinationGroup[] = [];
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

/**
 * Where the two choices launch a task: in the folder's space (opened or reused) when no
 * open space is picked, a new window of the open space in its current folder when no
 * folder is, or a new window of it in the folder. Undefined while neither is (or one is gone).
 */
export function launchTarget(host: ExtHostTargets, spaceKey: string, folderKey: string): ExtLaunchTarget | undefined {
  const space = spaceKey ? spaceChoices(host).find((s) => s.key === spaceKey) : undefined;
  const folder = folderKey ? folderGroups(host).flatMap((g) => g.items).find((d) => d.key === folderKey) : undefined;
  if ((spaceKey && !space) || (folderKey && !folder)) return undefined;
  if (space) return folder ? { session: space.id, ...folder.target } : { session: space.id };
  return folder?.target;
}

/** A remembered destination as the two choices; one of before (a space or a folder alone) still reads. */
export function rememberedChoice(r: { destination: string; space?: string } | undefined): { space: string; folder: string } {
  if (!r) return { space: '', folder: '' };
  if (r.space !== undefined) return { space: r.space, folder: r.destination };
  return r.destination.startsWith('space:') ? { space: r.destination, folder: '' } : { space: '', folder: r.destination };
}

/** The comment left on the card. */
export function commentText(r: Pick<ExtLaunchResult, 'hostName' | 'space' | 'windowName'>): string {
  return `🤖 Lanzada en ${r.hostName} › ${r.space} · ventana «${r.windowName}»`;
}
