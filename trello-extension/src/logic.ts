// What the dialog and the hub share (template, Doing list, destinations, comment) lives in
// shared/trello.ts, which this extension bundles.
export { commentText, DEFAULT_TEMPLATE, destinations, findDoingList, renderTemplate, spaceName, type Destination, type DestinationGroup } from '../../shared/trello';
export { cardWorktreeName, worktreeNameProblem } from '../../shared/worktree';

/** The panel's address as the extension keeps it: http(s), origin and path, no trailing slash. */
export function normalizeHubUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('La dirección tiene que empezar por https://');
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
}
