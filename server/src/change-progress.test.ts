import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changeLine } from '../../shared/change-progress.js';
import type { ChangeProgress } from '../../shared/types.js';
import { reviewState } from './change-progress.js';

const change = (over: Partial<ChangeProgress>): ChangeProgress => ({ name: 'show-progress', path: '/srv/shop/openspec/changes/show-progress', proposal: true, ...over });

test('the line of a change under review gives its tasks, pull request, round and blockers', () => {
  assert.equal(changeLine(change({ tasks: { done: 7, total: 23 }, review: { pr: 74, round: { n: 2, of: 3 }, blockers: 1 } })), '☑ 7/23 · PR #74 · ronda 2/3 · 1 bloqueante');
  assert.equal(changeLine(change({ tasks: { done: 7, total: 23 }, review: { pr: 74, round: { n: 3, of: 3 }, blockers: 2 } })), '☑ 7/23 · PR #74 · ronda 3/3 · 2 bloqueantes');
});

test('the line leaves out what the change does not have', () => {
  assert.equal(changeLine(change({ tasks: { done: 23, total: 23 }, review: { pr: 74, round: { n: 1, of: 3 }, blockers: 0 } })), '☑ 23/23 · PR #74 · ronda 1/3');
  assert.equal(changeLine(change({ tasks: { done: 3, total: 10 }, review: { pr: 74, blockers: 0 } })), '☑ 3/10 · PR #74');
  assert.equal(changeLine(change({ tasks: { done: 3, total: 10 } })), '☑ 3/10');
  assert.equal(changeLine(change({ review: { pr: 74, blockers: 0 } })), '☑ PR #74');
});

test('a change with neither progress nor review state goes by its name', () => {
  assert.equal(changeLine(change({ name: 'add-export' })), '☑ add-export');
  assert.equal(changeLine(change({ name: 'add-export', review: { blockers: 0 } })), '☑ add-export');
});

/** A version 1 registry with the given parts, the rest empty. */
function registry(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { version: 1, pr: null, budget: { maxRounds: 3, extensions: [], resets: [] }, rounds: [], findings: [], outcome: null, ...over };
}

const round = (n: number, counted = true) => ({ n, counted, budgetRound: counted ? n : null, mode: 'full', sha: 'abc', source: counted ? 'review-pr' : 'human' });
const finding = (severity: string, state: string) => ({ id: 'R1-01', severity, state, path: 'a.ts', title: 't' });

test('a change in its second round gives its pull request, the round over the limit and only the open blockers', () => {
  const json = registry({
    pr: 74,
    rounds: [round(1), round(2)],
    findings: [finding('REQUIRED', 'open'), finding('CRITICAL', 'fixed'), finding('SUGGESTION', 'open'), finding('CRITICAL', 'withdrawn')],
  });
  assert.deepEqual(reviewState(json), { pr: 74, round: { n: 2, of: 3 }, blockers: 1 });
});

test('the round counts only the counted rounds after the last reset, and the extensions granted since', () => {
  const json = registry({
    budget: { maxRounds: 3, extensions: [{ afterRound: 1 }, { afterRound: 3 }], resets: [{ afterRound: 1 }, { afterRound: 2 }] },
    rounds: [round(1), round(2), round(3), round(4, false)],
  });
  assert.deepEqual(reviewState(json), { round: { n: 1, of: 4 }, blockers: 0 });
});

test('an extension granted right at the last reset raises the limit, as the harness counts it', () => {
  const json = registry({ budget: { maxRounds: 3, extensions: [{ afterRound: 2 }], resets: [{ afterRound: 2 }] }, rounds: [round(1), round(2), round(3)] });
  assert.deepEqual(reviewState(json), { round: { n: 1, of: 4 }, blockers: 0 });
});

test('a pull request with no round yet gives no round', () => {
  assert.deepEqual(reviewState(registry({ pr: 74 })), { pr: 74, blockers: 0 });
});

test('a registry of another version, or that is not one, gives nothing', () => {
  assert.equal(reviewState(registry({ version: 2, pr: 74 })), undefined);
  assert.equal(reviewState({ pr: 74 }), undefined);
  assert.equal(reviewState('{"version":1}'), undefined);
  assert.equal(reviewState(null), undefined);
  assert.equal(reviewState([registry()]), undefined);
});

test('malformed fields are dropped, not trusted', () => {
  const json = registry({
    pr: '74',
    budget: { maxRounds: 'tres', extensions: 'none', resets: null },
    rounds: 'many',
    findings: [null, 'x', finding('REQUIRED', 'open'), { severity: 'REQUIRED' }],
  });
  assert.deepEqual(reviewState(json), { blockers: 1 });
  // With a sound limit and counted rounds, but no budget object at all.
  assert.deepEqual(reviewState(registry({ budget: undefined, rounds: [round(1)] })), { blockers: 0 });
});
