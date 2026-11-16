import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AccountUsage, ClaudeAccount, HostInfo, RateLimits } from '../../shared/types.js';
import { checkLimits, isForeign } from './limits-check.js';

const H = 3600;
const NOW = Date.parse('2026-11-16T09:40:00Z') / 1000;

/** The hub's reading of an account: its 5-hour and weekly resets, `undefined` for a window it has none of. */
function hub(five: number | undefined, seven: number | undefined): AccountUsage {
  return {
    t: NOW - 60,
    fiveHour: five === undefined ? undefined : { pct: 40, resetsAt: five },
    sevenDay: seven === undefined ? undefined : { pct: 96, resetsAt: seven },
    models: [],
  };
}

/** A statusline reading under some email, with its 5-hour and weekly resets. */
function reading(five: number, seven: number): RateLimits {
  return { fiveHour: { pct: 5, resetsAt: five }, sevenDay: { pct: 0, resetsAt: seven }, updatedAt: NOW, account: 's2@example.com' };
}

// s2's own windows, and those of s1, the account the reported Claude was still on.
const S2_FIVE = NOW + 3 * H;
const S2_SEVEN = NOW + 3 * 24 * H;
const S1_FIVE = NOW + 4 * H;
const S1_SEVEN = NOW + 7 * 24 * H;

test("a reading with another account's weekly reset is foreign", () => {
  assert.equal(isForeign(reading(S2_FIVE, S1_SEVEN), hub(S2_FIVE, S2_SEVEN), NOW), true);
});

test("a reading with another account's 5-hour reset is foreign, even with the same weekly one", () => {
  assert.equal(isForeign(reading(S1_FIVE, S2_SEVEN), hub(S2_FIVE, S2_SEVEN), NOW), true);
});

test("a reading whose resets match the hub's is the account's own", () => {
  assert.equal(isForeign(reading(S2_FIVE, S2_SEVEN), hub(S2_FIVE, S2_SEVEN), NOW), false);
});

test('resets within 5 minutes of each other are the same window', () => {
  assert.equal(isForeign(reading(S2_FIVE + 299, S2_SEVEN - 299), hub(S2_FIVE, S2_SEVEN), NOW), false);
  assert.equal(isForeign(reading(S2_FIVE, S2_SEVEN + 301), hub(S2_FIVE, S2_SEVEN), NOW), true);
});

test("after the hub's weekly reset has passed, a reading of the new week is not foreign", () => {
  const past = NOW - H;
  assert.equal(isForeign(reading(S2_FIVE, past + 7 * 24 * H), hub(S2_FIVE - 5 * H, past), NOW), false);
});

test('a reading whose own windows have ended is not foreign', () => {
  assert.equal(isForeign(reading(NOW - 2 * H, NOW - H), hub(S2_FIVE, S2_SEVEN), NOW), false);
});

test('a window the hub has no reading of is not compared', () => {
  assert.equal(isForeign(reading(S1_FIVE, S1_SEVEN), hub(undefined, undefined), NOW), false);
  assert.equal(isForeign(reading(S1_FIVE, S1_SEVEN), undefined, NOW), false);
  assert.equal(isForeign(reading(S1_FIVE, S2_SEVEN), hub(undefined, S2_SEVEN), NOW), false);
});

test('a reset of 0 (unknown) is not compared', () => {
  assert.equal(isForeign(reading(0, S1_SEVEN), hub(S2_FIVE, 0), NOW), false);
});

// ---------------------------------------------------------------- every host and account

function host(id: string, limits: RateLimits[]): HostInfo {
  return { id, name: id, status: 'ok', sessions: [], limits };
}

function account(id: string, email: string, usage?: AccountUsage): ClaudeAccount {
  return { id, alias: id, email, usage, activeOn: [], mislabelledOn: [], spare: 0, needsLogin: false };
}

function under(email: string | undefined, r: RateLimits): RateLimits {
  return { ...r, account: email };
}

const s2 = account('acc-s2:org', 's2@example.com', hub(S2_FIVE, S2_SEVEN));

test('a foreign reading is dropped from its host and the host is listed under the account', () => {
  const own = under('s1@example.com', reading(S1_FIVE, S1_SEVEN));
  const foreign = under('s2@example.com', reading(S1_FIVE, S1_SEVEN));
  const s1 = account('acc-s1:org', 's1@example.com', hub(S1_FIVE, S1_SEVEN));
  const r = checkLimits([host('claude', [own, foreign])], [s1, s2], NOW);
  assert.deepEqual(r.kept.get('claude'), [own]);
  assert.deepEqual(r.mislabelledOn.get('acc-s2:org'), ['claude']);
  assert.equal(r.mislabelledOn.get('acc-s1:org'), undefined);
});

test("a reading that matches the hub's is kept and lists nothing", () => {
  const ok = under('s2@example.com', reading(S2_FIVE, S2_SEVEN));
  const r = checkLimits([host('claude', [ok])], [s2], NOW);
  assert.deepEqual(r.kept.get('claude'), [ok]);
  assert.equal(r.mislabelledOn.size, 0);
});

test('readings of an email two accounts share, of one no account has, or without an email are kept unchecked', () => {
  const shared = under('s2@example.com', reading(S1_FIVE, S1_SEVEN));
  const unknown = under('other@example.com', reading(S1_FIVE, S1_SEVEN));
  const noEmail = under(undefined, reading(S1_FIVE, S1_SEVEN));
  const twin = account('acc-s2:org-team', 's2@example.com', hub(S2_FIVE, S2_SEVEN));
  const r = checkLimits([host('claude', [shared, unknown, noEmail])], [s2, twin], NOW);
  assert.deepEqual(r.kept.get('claude'), [shared, unknown, noEmail]);
  assert.equal(r.mislabelledOn.size, 0);
});

test('two hosts with a foreign reading under one account are both listed, in host order', () => {
  const foreign = under('s2@example.com', reading(S1_FIVE, S1_SEVEN));
  const r = checkLimits([host('dev', [foreign]), host('mac', []), host('claude', [foreign])], [s2], NOW);
  assert.deepEqual(r.mislabelledOn.get('acc-s2:org'), ['dev', 'claude']);
  assert.deepEqual(r.kept.get('dev'), []);
  assert.deepEqual(r.kept.get('mac'), []);
  assert.deepEqual(r.kept.get('claude'), []);
});
