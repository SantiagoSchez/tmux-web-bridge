import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findRefs, parseRemote, refUrl } from '../../shared/refs.js';

/** What a hit covers in the line, its kind and its number: what the link provider underlines and opens. */
const hits = (text: string) => findRefs(text).map((h) => [text.slice(h.start, h.end), h.kind, h.n]);

test('finds the references an agent writes, with the text they cover', () => {
  assert.deepEqual(hits('Abierta la PR #123 para la Issue #42.'), [
    ['PR #123', 'pr', 123],
    ['Issue #42', 'issue', 42],
  ]);
  assert.deepEqual(hits('Movida Trello #470 a Doing; pipeline #1987 en verde'), [
    ['Trello #470', 'trello', 470],
    ['pipeline #1987', 'pipeline', 1987],
  ]);
});

test('the keyword matches in any letter case', () => {
  assert.deepEqual(hits('pr #1, ISSUE #2, trello #3, Pipeline #4'), [
    ['pr #1', 'pr', 1],
    ['ISSUE #2', 'issue', 2],
    ['trello #3', 'trello', 3],
    ['Pipeline #4', 'pipeline', 4],
  ]);
});

test('finds image placeholders as a whole', () => {
  assert.deepEqual(hits('mira esto [Image #1] y [Image #12]'), [
    ['[Image #1]', 'image', 1],
    ['[Image #12]', 'image', 12],
  ]);
});

test('a reference in brackets or after punctuation is still found', () => {
  assert.deepEqual(hits('(PR #7), «Issue #8»'), [
    ['PR #7', 'pr', 7],
    ['Issue #8', 'issue', 8],
  ]);
});

test('ignores what only looks like a reference', () => {
  for (const text of ['SPR #12', 'reissue #3', 'PR#12', 'PR #', 'PR #x', '#12', 'Issue  #4', 'PR #12a', 'Image #1', '[image #1]', '[Image #]'])
    assert.deepEqual(hits(text), [], text);
});

test('reads GitHub and Bitbucket remotes in every form git writes them', () => {
  const gh = { host: 'github', path: 'owner/repo' };
  const bb = { host: 'bitbucket', path: 'workspace/repo' };
  const cases: [string, unknown][] = [
    ['git@github.com:owner/repo.git', gh],
    ['git@github.com:owner/repo', gh],
    ['ssh://git@github.com/owner/repo.git', gh],
    ['https://github.com/owner/repo.git', gh],
    ['https://github.com/owner/repo', gh],
    ['https://token@github.com/owner/repo.git', gh],
    ['git@bitbucket.org:workspace/repo.git', bb],
    ['ssh://git@bitbucket.org/workspace/repo.git', bb],
    ['https://user@bitbucket.org/workspace/repo.git', bb],
    ['https://bitbucket.org/workspace/repo', bb],
    ['https://github.com/owner/repo.git/\n', gh],
  ];
  for (const [url, repo] of cases) assert.deepEqual(parseRemote(url), repo, url);
});

test('a remote of another host, or something that is not a remote, gives no repository', () => {
  for (const url of ['git@gitlab.com:owner/repo.git', 'https://example.com/owner/repo', '/srv/git/repo.git', 'https://github.com/owner', 'https://github.com/owner/repo/extra', '', 'nonsense'])
    assert.equal(parseRemote(url), undefined, url);
});

test('builds the page of each reference on GitHub and Bitbucket', () => {
  const gh = { host: 'github', path: 'owner/repo' } as const;
  const bb = { host: 'bitbucket', path: 'workspace/repo' } as const;
  assert.equal(refUrl('pr', 123, gh), 'https://github.com/owner/repo/pull/123');
  assert.equal(refUrl('issue', 42, gh), 'https://github.com/owner/repo/issues/42');
  assert.equal(refUrl('pr', 332, bb), 'https://bitbucket.org/workspace/repo/pull-requests/332');
  assert.equal(refUrl('issue', 5, bb), 'https://bitbucket.org/workspace/repo/issues/5');
  assert.equal(refUrl('pipeline', 1987, bb), 'https://bitbucket.org/workspace/repo/pipelines/results/1987');
});

test('a pipeline on GitHub, a Trello card or an image have no repository page', () => {
  const gh = { host: 'github', path: 'owner/repo' } as const;
  assert.equal(refUrl('pipeline', 1987, gh), undefined);
  assert.equal(refUrl('trello', 470, gh), undefined);
  assert.equal(refUrl('image', 1, gh), undefined);
});
