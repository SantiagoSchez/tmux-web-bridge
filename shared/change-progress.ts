// How the panel writes an OpenSpec change of a pane's repository: its tasks, its pull request,
// its review round and its open blockers, in that order and only those it has. The list's row,
// the «Pendientes» card and the hover tooltip all take their text from here.

import type { ChangeProgress } from './types.js';

/**
 * A change's task count with the share of it done, «7/23 (30 %)». Rounded down, so «100 %»
 * only when every task is ticked.
 */
export function taskProgress(tasks: NonNullable<ChangeProgress['tasks']>): string {
  return `${tasks.done}/${tasks.total} (${Math.floor((tasks.done * 100) / tasks.total)} %)`;
}

/** What is known of a change, each part as the panel writes it: «7/23 (30 %)», «PR #74», «ronda 2/3», «1 bloqueante». */
export function changeFacts(change: ChangeProgress): string[] {
  const facts: string[] = [];
  if (change.tasks) facts.push(taskProgress(change.tasks));
  const r = change.review;
  if (r?.pr) facts.push(`PR #${r.pr}`);
  if (r?.round) facts.push(`ronda ${r.round.n}/${r.round.of}`);
  if (r?.blockers) facts.push(`${r.blockers} ${r.blockers === 1 ? 'bloqueante' : 'bloqueantes'}`);
  return facts;
}

/** The change's line in the list and the cards: «☑ 7/23 (30 %) · PR #74 · ronda 2/3 · 1 bloqueante», or «☑ <name>» when nothing is known of it. */
export function changeLine(change: ChangeProgress): string {
  const facts = changeFacts(change);
  return `☑ ${facts.length ? facts.join(' · ') : change.name}`;
}
