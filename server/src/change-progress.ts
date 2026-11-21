// The active OpenSpec changes of a pane's repository, when that repository runs the koalarnes
// harness: how many tasks each one has done and where its review stands. The git scanner
// (git.ts) reads them with the worktree and branch of each folder; this module holds the
// shell that lists them and the reading of each change's review registry (review.json).

import type { ChangeProgress } from '../../shared/types.js';
import { CONFIG_FILE } from './harness-config.js';

/** At most this many changes of a repository are read, in name order. */
export const MAX_CHANGES = 20;
/** A review registry bigger than this is not read: its change shows no review state. */
export const MAX_REVIEW = 65_536;

/**
 * Shell, inside a loop over repository top folders in `$top`: when the top folder has a
 * harness configuration, one S line per change of openspec/changes/ (not archive/) with its
 * ticked and unticked checkboxes and whether it has tasks.md (t) and proposal.md (p), and
 * an R line with its review.json on one line (its line breaks and tabs, only whitespace in
 * valid JSON, become spaces) when it has one of at most MAX_REVIEW bytes. A change whose
 * name holds a tab or a line break is skipped: it would break the tagged lines, and a line
 * break could forge another line (the machine's home).
 */
export const CHANGES_SCRIPT =
  CONFIG_FILE +
  `[ -f "$f" ] || continue; n=0; tb=$(printf '\\t'); nl=$(printf '\\nx'); nl=\${nl%x}; ` +
  `for d in "$top"/openspec/changes/*/; do [ -d "$d" ] || continue; c=\${d%/}; c=\${c##*/}; [ "$c" = archive ] && continue; ` +
  `case "$c" in *"$tb"*|*"$nl"*) continue ;; esac; ` +
  `n=$((n + 1)); [ "$n" -gt ${MAX_CHANGES} ] && break; x=0; o=0; fl=; ` +
  `if [ -f "\${d}tasks.md" ]; then fl=t; x=$(grep -cE '^[[:space:]]*- \\[[xX]\\]' "\${d}tasks.md"); o=$(grep -cE '^[[:space:]]*- \\[ \\]' "\${d}tasks.md"); fi; ` +
  `[ -f "\${d}proposal.md" ] && fl="\${fl}p"; ` +
  `printf 'S\\t%s\\t%s\\t%s\\t%s\\t%s\\n' "$top" "$c" "$x" "$o" "$fl"; ` +
  `r="\${d}review.json"; if [ -f "$r" ]; then s=$(wc -c < "$r"); [ $s -le ${MAX_REVIEW} ] && printf 'R\\t%s\\t%s\\t%s\\n' "$top" "$c" "$(tr '\\n\\r\\t' '   ' < "$r")"; fi; ` +
  `done; `;

/**
 * The S and R lines CHANGES_SCRIPT printed, as each top folder's changes in name order.
 * A line with the wrong number of fields (a name with a tab in it) is dropped.
 */
export function parseChanges(lines: string[]): Map<string, ChangeProgress[]> {
  const byTop = new Map<string, Map<string, ChangeProgress>>();
  const reviews: [string, string, string][] = [];
  for (const line of lines) {
    const f = line.split('\t');
    if (f[0] === 'S' && f.length === 6 && f[1] && f[2]) {
      const [, top, name, ticked, unticked, flags] = f;
      const done = Number(ticked);
      const total = done + Number(unticked);
      const c: ChangeProgress = { name, path: `${top}/openspec/changes/${name}`, proposal: flags.includes('p') };
      if (flags.includes('t') && total > 0 && Number.isInteger(total)) c.tasks = { done, total };
      const ofTop = byTop.get(top) ?? new Map<string, ChangeProgress>();
      ofTop.set(name, c);
      byTop.set(top, ofTop);
    } else if (f[0] === 'R' && f.length === 4) reviews.push([f[1], f[2], f[3]]);
  }
  for (const [top, name, text] of reviews) {
    const c = byTop.get(top)?.get(name);
    if (!c) continue;
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      continue;
    }
    const review = reviewState(json);
    if (review) c.review = review;
  }
  const out = new Map<string, ChangeProgress[]>();
  for (const [top, changes] of byTop) out.set(top, [...changes.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)));
  return out;
}

/** A field of an untrusted object, when it is an object itself. */
const obj = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const count = (v: unknown): number | undefined => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : undefined);

/**
 * What a change's review.json says: its pull request, the round over the budget limit and
 * the open blockers. Only version 1 is read; any other value gives nothing, so a new format
 * of the harness never shows wrong numbers. The round follows the harness's own count
 * (`budgetOf` in ka's review-rounds): the counted rounds after the last reset, over the
 * budget plus the extensions granted since that reset. Malformed fields are left out.
 */
export function reviewState(json: unknown): ChangeProgress['review'] {
  const r = obj(json);
  if (!r || r.version !== 1) return undefined;
  const out: NonNullable<ChangeProgress['review']> = { blockers: 0 };
  const pr = count(r.pr);
  if (pr) out.pr = pr;
  const budget = obj(r.budget);
  const max = count(budget?.maxRounds);
  if (budget && max !== undefined) {
    const since = count(obj(list(budget.resets).at(-1))?.afterRound) ?? 0;
    const n = list(r.rounds).filter((x) => obj(x)?.counted === true && (count(obj(x)?.n) ?? 0) > since).length;
    const extensions = list(budget.extensions).filter((x) => (count(obj(x)?.afterRound) ?? -1) >= since).length;
    if (n > 0) out.round = { n, of: max + extensions };
  }
  out.blockers = list(r.findings).filter((x) => {
    const f = obj(x);
    return f && (f.severity === 'CRITICAL' || f.severity === 'REQUIRED') && f.state === 'open';
  }).length;
  return out;
}
