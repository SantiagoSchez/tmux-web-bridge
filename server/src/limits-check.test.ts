import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AccountUsage, ClaudeAccount, HostInfo, RateLimits } from '../../shared/types.js';
import { checkLimits, isForeign, type LimitsCheck, SentLimits } from './limits-check.js';

const H = 3600;
const NOW = Date.parse('2026-11-16T09:40:00Z') / 1000;

/**
 * The hub's reading of an account, taken at `t` (a minute ago by default): its 5-hour
 * and weekly resets, `undefined` for a window it has none of.
 */
function hub(five: number | undefined, seven: number | undefined, t = NOW - 60): AccountUsage {
  return {
    t,
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

test('resets up to 5 minutes apart are the same window', () => {
  assert.equal(isForeign(reading(S2_FIVE + 300, S2_SEVEN - 300), hub(S2_FIVE, S2_SEVEN), NOW), false);
  assert.equal(isForeign(reading(S2_FIVE, S2_SEVEN + 301), hub(S2_FIVE, S2_SEVEN), NOW), true);
});

test("after the hub's weekly reset has passed, a reading of the new week is not foreign", () => {
  const past = NOW - H;
  // The hub read the account before both its windows ended.
  assert.equal(isForeign(reading(S2_FIVE, past + 7 * 24 * H), hub(S2_FIVE - 5 * H, past, NOW - 3 * H), NOW), false);
});

test('a reading whose own windows have ended is not foreign', () => {
  assert.equal(isForeign(reading(NOW - 2 * H, NOW - H), hub(S2_FIVE, S2_SEVEN), NOW), false);
  // A reset of exactly now has ended too.
  assert.equal(isForeign(reading(NOW, S2_SEVEN), hub(S2_FIVE, S2_SEVEN), NOW), false);
});

test('an account the hub has never read is not compared', () => {
  assert.equal(isForeign(reading(S1_FIVE, S1_SEVEN), undefined, NOW), false);
});

test('a window the reading lacks (a reset of 0) is not looked at', () => {
  assert.equal(isForeign(reading(0, S2_SEVEN), hub(S2_FIVE, S2_SEVEN), NOW), false);
  assert.equal(isForeign(reading(S2_FIVE, 0), hub(S2_FIVE, S2_SEVEN), NOW), false);
});

// ---------------------------------------------------------------- windows the hub saw closed

/** When the hub read the account (see `hub()`). */
const READ_AT = NOW - 60;
const FIVE = 5 * H;
const WEEK = 7 * 24 * H;

test('with no hub window, a reading whose window started before the hub read the account is foreign', () => {
  // An account not used since its weekly reset: the hub sees no 7-day window, and s1's started two hours before.
  assert.equal(isForeign(reading(S2_FIVE, READ_AT - 2 * H + WEEK), hub(S2_FIVE, undefined), NOW), true);
  assert.equal(isForeign(reading(S2_FIVE, READ_AT - 2 * H + WEEK), hub(S2_FIVE, 0), NOW), true);
  assert.equal(isForeign(reading(READ_AT - 2 * H + FIVE, S2_SEVEN), hub(undefined, S2_SEVEN), NOW), true);
  assert.equal(isForeign(reading(READ_AT - 2 * H + FIVE, S2_SEVEN), hub(0, S2_SEVEN), NOW), true);
});

test("with no hub window, a window opened after the hub's reading is the account's own", () => {
  assert.equal(isForeign(reading(S2_FIVE, READ_AT + 2 * H + WEEK), hub(S2_FIVE, undefined), NOW), false);
  assert.equal(isForeign(reading(READ_AT + 20 * 60 + FIVE, S2_SEVEN), hub(undefined, S2_SEVEN), NOW), false);
});

test("a window's start is compared with one reset step of margin: 10 minutes for 5 hours, 1 hour for 7 days", () => {
  assert.equal(isForeign(reading(READ_AT - 9 * 60 + FIVE, S2_SEVEN), hub(undefined, S2_SEVEN), NOW), false);
  assert.equal(isForeign(reading(READ_AT - 11 * 60 + FIVE, S2_SEVEN), hub(undefined, S2_SEVEN), NOW), true);
  assert.equal(isForeign(reading(S2_FIVE, READ_AT - 59 * 60 + WEEK), hub(S2_FIVE, undefined), NOW), false);
  assert.equal(isForeign(reading(S2_FIVE, READ_AT - 61 * 60 + WEEK), hub(S2_FIVE, undefined), NOW), true);
  // Exactly one step before is still within the margin.
  assert.equal(isForeign(reading(READ_AT - 10 * 60 + FIVE, S2_SEVEN), hub(undefined, S2_SEVEN), NOW), false);
  assert.equal(isForeign(reading(S2_FIVE, READ_AT - 60 * 60 + WEEK), hub(S2_FIVE, undefined), NOW), false);
});

test("a reading whose window started before the hub's ended window reset is foreign", () => {
  const ended = NOW - H;
  // The hub read the account two hours ago, while these windows were still current.
  const readBefore = NOW - 2 * H;
  // 7 days: s1's week started three hours ago, before s2's week ended an hour ago.
  assert.equal(isForeign(reading(S2_FIVE, NOW - 3 * H + WEEK), hub(S2_FIVE, ended, readBefore), NOW), true);
  // 5 hours: a window that started two hours ago, before the hub's ended an hour ago.
  assert.equal(isForeign(reading(NOW - 2 * H + FIVE, S2_SEVEN), hub(ended, S2_SEVEN, readBefore), NOW), true);
  // The next 5-hour window, opened after the hub's ended.
  assert.equal(isForeign(reading(NOW - 30 * 60 + FIVE, S2_SEVEN), hub(ended, S2_SEVEN, readBefore), NOW), false);
  // A hub window that ends right now has ended: the next one, opening now, is the account's.
  assert.equal(isForeign(reading(NOW + FIVE, S2_SEVEN), hub(NOW, S2_SEVEN), NOW), false);
});

test('when the hub read the account after its window ended, a window opened in between is foreign', () => {
  // The hub's 5-hour window ended three hours ago and it read the account a minute ago,
  // still with that window: the account had none open in between.
  assert.equal(isForeign(reading(NOW - 2 * H + FIVE, S2_SEVEN), hub(NOW - 3 * H, S2_SEVEN), NOW), true);
  // A window opened after the hub's reading is the account's.
  assert.equal(isForeign(reading(NOW + FIVE, S2_SEVEN), hub(NOW - 3 * H, S2_SEVEN), NOW), false);
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

// ---------------------------------------------------------------- what the panel last got

function checked(kept: [string, RateLimits[]][], mislabelledOn: [string, string[]][] = []): LimitsCheck {
  return { kept: new Map(kept), mislabelledOn: new Map(mislabelledOn) };
}

const OWN = under('s2@example.com', reading(S2_FIVE, S2_SEVEN));

test('before anything is sent, a check with no readings and no warnings changes nothing', () => {
  const sent = new SentLimits();
  const empty = checked([['claude', []], ['mac', []]]);
  assert.deepEqual(sent.hostsChanged(empty), []);
  assert.equal(sent.accountsChanged(empty), false);
});

test('a host whose kept readings differ from what was sent of it has changed, until they are sent', () => {
  const sent = new SentLimits();
  const check = checked([['claude', [OWN]], ['mac', []]]);
  assert.deepEqual(sent.hostsChanged(check), ['claude']);
  sent.sentHost('claude', [OWN]);
  assert.deepEqual(sent.hostsChanged(check), []);
  assert.deepEqual(sent.hostsChanged(checked([['claude', []], ['mac', []]])), ['claude']);
});

test('a host sent without readings (none in its statusline) matches one with none kept', () => {
  const sent = new SentLimits();
  sent.sentHost('claude', [OWN]);
  sent.sentHost('claude', undefined);
  assert.deepEqual(sent.hostsChanged(checked([['claude', []]])), []);
});

test("a forgotten host's readings count as never sent", () => {
  const sent = new SentLimits();
  sent.sentHost('claude', [OWN]);
  sent.forget('claude');
  assert.deepEqual(sent.hostsChanged(checked([['claude', [OWN]]])), ['claude']);
});

test("the accounts have changed when a check's warnings differ from the ones last sent", () => {
  const sent = new SentLimits();
  const warned = checked([['claude', []]], [['acc-s2:org', ['claude']]]);
  assert.equal(sent.accountsChanged(warned), true);
  sent.sentAccounts(warned);
  assert.equal(sent.accountsChanged(warned), false);
  assert.equal(sent.accountsChanged(checked([['claude', []]], [['acc-s2:org', ['claude', 'mac']]])), true);
  assert.equal(sent.accountsChanged(checked([['claude', []]])), true);
});
