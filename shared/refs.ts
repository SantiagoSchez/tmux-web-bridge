// References an agent writes in the terminal (PR #12, Issue #3, pipeline #9, Trello #470)
// and Claude Code's image placeholders ([Image #1]), to turn them into links. Which page a
// reference opens depends on the pane's project (RefContext, read by the hub).

import type { RefRepo } from './types.js';

export type RefKind = 'pr' | 'issue' | 'pipeline' | 'trello' | 'image';

export interface RefHit {
  /** Indices in the line: [start, end). */
  start: number;
  end: number;
  kind: RefKind;
  n: number;
}

const KEYWORD: Record<string, RefKind> = { pr: 'pr', issue: 'issue', pipeline: 'pipeline', trello: 'trello' };

/** A keyword not glued to a word before it, one space, # and the number, which ends there. */
const REF = /(?<![\p{L}\p{N}_])(PR|Issue|pipeline|Trello) #(\d{1,9})(?![\p{L}\p{N}_])/giu;
const IMAGE = /\[Image #(\d{1,9})\]/g;

/** The references and image placeholders in a line of text, in order. */
export function findRefs(text: string): RefHit[] {
  const out: RefHit[] = [];
  for (const m of text.matchAll(REF)) out.push({ start: m.index, end: m.index + m[0].length, kind: KEYWORD[m[1].toLowerCase()], n: Number(m[2]) });
  for (const m of text.matchAll(IMAGE)) out.push({ start: m.index, end: m.index + m[0].length, kind: 'image', n: Number(m[1]) });
  return out.sort((a, b) => a.start - b.start);
}

const HOSTS: Record<string, RefRepo['host']> = { 'github.com': 'github', 'bitbucket.org': 'bitbucket' };

/**
 * The GitHub or Bitbucket repository of a git remote, in any form git writes it
 * (git@host:a/b.git, ssh://git@host/a/b, https://user@host/a/b.git); nothing for other hosts.
 */
export function parseRemote(url: string): RefRepo | undefined {
  const m = /^(?:[a-z+]+:\/\/)?(?:[^@/\s]+@)?([\w.-]+)(?::\d+)?[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(url.trim());
  const host = m && HOSTS[m[1].toLowerCase()];
  return host ? { host, path: `${m[2]}/${m[3]}` } : undefined;
}

/** The page of a pull request, issue or pipeline of a repository; nothing for what has none (a pipeline on GitHub). */
export function refUrl(kind: RefKind, n: number, repo: RefRepo): string | undefined {
  const base = repo.host === 'github' ? `https://github.com/${repo.path}` : `https://bitbucket.org/${repo.path}`;
  if (kind === 'pr') return repo.host === 'github' ? `${base}/pull/${n}` : `${base}/pull-requests/${n}`;
  if (kind === 'issue') return `${base}/issues/${n}`;
  if (kind === 'pipeline' && repo.host === 'bitbucket') return `${base}/pipelines/results/${n}`;
  return undefined;
}
