import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type AccountUsageNow,
  decideRotation,
  type RotationAccount,
  type RotationInput,
  type RotationMachine,
  rotationAccounts,
  sanitizeAccountRotation,
} from '../../shared/rotation.js';
import type { AccountRotationSettings, AccountsInfo, AccountUsage, ActivityAccount, ClaudeAccount, RateLimits, UsageWindow } from '../../shared/types.js';
import { checkLimits } from './limits-check.js';
import { AccountRotation, rotationNotice } from './rotation.js';

// ---------------------------------------------------------------- settings

test('settings that are not an object keep the previous ones', () => {
  const prev = { fiveHour: 80, sevenDay: 85, hosts: ['mac'] };
  for (const bad of [undefined, null, 'x', [1]]) assert.deepEqual(sanitizeAccountRotation(bad, prev), prev);
});

test('thresholds take whole percentages from 1 to 100', () => {
  const got = sanitizeAccountRotation({ fiveHour: 1, sevenDay: 100, hosts: [] }, { fiveHour: 90, sevenDay: 95, hosts: [] });
  assert.deepEqual(got, { fiveHour: 1, sevenDay: 100, hosts: [] });
});

test('a threshold out of range or not a whole number keeps the previous one, and the other field still changes', () => {
  const prev = { fiveHour: 80, sevenDay: 85, hosts: ['linux-box'] };
  for (const bad of [0, 150, 90.5, '90', null, Number.NaN]) {
    assert.deepEqual(sanitizeAccountRotation({ fiveHour: bad, sevenDay: 70, hosts: ['linux-box'] }, prev), { fiveHour: 80, sevenDay: 70, hosts: ['linux-box'] });
  }
});

test('the machines are a list of ids, each once; anything else keeps the previous list', () => {
  const prev = { fiveHour: 90, sevenDay: 95, hosts: ['mac'] };
  assert.deepEqual(sanitizeAccountRotation({ ...prev, hosts: ['linux-box', 'linux-box', 3, '', 'mac'] }, prev).hosts, ['linux-box', 'mac']);
  assert.deepEqual(sanitizeAccountRotation({ ...prev, hosts: 'linux-box' }, prev).hosts, ['mac']);
});

// ---------------------------------------------------------------- the usage the decision uses

const NOW = 1_800_000_000; // epoch seconds
const FIVE_RESET = NOW + 3600;
const WEEK_RESET = NOW + 3 * 86_400;

function hubUsage(five: number, seven: number, t = NOW - 240, fiveReset = FIVE_RESET, sevenReset = WEEK_RESET): AccountUsage {
  return { t, fiveHour: { pct: five, resetsAt: fiveReset }, sevenDay: { pct: seven, resetsAt: sevenReset }, models: [] };
}

function account(id: string, over: Partial<ClaudeAccount> = {}): ClaudeAccount {
  return { id, alias: id, email: `${id}@example.com`, activeOn: [], mislabelledOn: [], spare: 1, needsLogin: false, ...over };
}

function reading(email: string, five: number, seven: number, updatedAt = NOW - 60): RateLimits {
  return { account: email, updatedAt, fiveHour: { pct: five, resetsAt: FIVE_RESET }, sevenDay: { pct: seven, resetsAt: WEEK_RESET } };
}

const usageOf = (list: ClaudeAccount[], readings: RateLimits[], id: string): AccountUsageNow | null => rotationAccounts(list, readings, NOW).find((a) => a.id === id)!.usage;

test("an account's usage is the hub's reading when no statusline published a newer one", () => {
  const s1 = account('s1', { usage: hubUsage(85, 40) });
  assert.deepEqual(usageOf([s1], [], 's1'), { five: 85, seven: 40, fiveReset: FIVE_RESET, sevenReset: WEEK_RESET });
});

test("a fresher statusline reading under the account's email wins over the hub's", () => {
  const s1 = account('s1', { usage: hubUsage(85, 40, NOW - 240) });
  assert.equal(usageOf([s1], [reading('s1@example.com', 92, 41, NOW - 60)], 's1')?.five, 92);
});

test("an older statusline reading does not replace the hub's", () => {
  const s1 = account('s1', { usage: hubUsage(85, 40, NOW - 30) });
  assert.equal(usageOf([s1], [reading('s1@example.com', 92, 41, NOW - 60)], 's1')?.five, 85);
});

test('statusline readings under an email two accounts share are not used', () => {
  const a = account('a', { email: 'same@example.com', usage: hubUsage(50, 50) });
  const b = account('b', { email: 'same@example.com', usage: hubUsage(10, 10) });
  assert.equal(usageOf([a, b], [reading('same@example.com', 99, 99)], 'b')?.five, 10);
});

test('a window whose reset has passed counts as 0 %', () => {
  const s2 = account('s2', { usage: hubUsage(100, 70, NOW - 240, NOW - 10) });
  assert.deepEqual(usageOf([s2], [], 's2'), { five: 0, seven: 70, fiveReset: NOW - 10, sevenReset: WEEK_RESET });
});

test("a model's weekly limit does not count", () => {
  const s1 = account('s1', { usage: { ...hubUsage(20, 30), models: [{ name: 'Fable', pct: 100, resetsAt: WEEK_RESET }] } });
  assert.deepEqual(usageOf([s1], [], 's1'), { five: 20, seven: 30, fiveReset: FIVE_RESET, sevenReset: WEEK_RESET });
});

test('an account the hub never read, and no statusline either, has no usage', () => {
  assert.equal(usageOf([account('s1')], [], 's1'), null);
});

test('an account whose usage could not be read, or that needs a new login, cannot be a target', () => {
  const list = rotationAccounts([account('s1', { usage: hubUsage(10, 10), usageError: 'Anthropic no contesta' }), account('s2', { usage: hubUsage(10, 10), needsLogin: true }), account('s3', { usage: hubUsage(10, 10) })], [], NOW);
  assert.deepEqual(
    list.map((a) => [a.id, a.usable]),
    [
      ['s1', false],
      ['s2', false],
      ['s3', true],
    ],
  );
});

// ---------------------------------------------------------------- the decision

function acc(id: string, five: number, seven: number, over: Partial<RotationAccount> = {}): RotationAccount {
  return { id, alias: id, usage: { five, seven, fiveReset: FIVE_RESET, sevenReset: WEEK_RESET }, activeOn: [], spare: 1, usable: true, ...over };
}

function machine(id: string, account: string | null, over: Partial<RotationMachine> = {}): RotationMachine {
  return { id, account, connected: true, switching: false, ...over };
}

function input(accounts: RotationAccount[], machines: RotationMachine[], over: Partial<RotationInput> = {}): RotationInput {
  return {
    settings: { fiveHour: 90, sevenDay: 95, hosts: machines.map((m) => m.id) },
    accounts,
    machines,
    memory: { left: {}, warned: {}, failed: {}, retryAt: {} },
    skip: [],
    now: NOW,
    ...over,
  };
}

/** s1, on linux-box, at the given usage. */
const onS1 = (five: number, seven: number) => acc('s1', five, seven, { activeOn: ['linux-box'], spare: 0 });

test('a machine with the switch off is never switched', () => {
  const got = decideRotation(input([onS1(99, 10), acc('s2', 10, 10)], [machine('linux-box', 's1')], { settings: { fiveHour: 90, sevenDay: 95, hosts: [] } }));
  assert.equal(got, null);
});

test('a machine below both thresholds stays', () => {
  assert.equal(decideRotation(input([onS1(89, 94), acc('s2', 10, 10)], [machine('linux-box', 's1')])), null);
});

test('over the 5-hour threshold it goes to an account with margin, saying which limit and how much', () => {
  const got = decideRotation(input([onS1(91, 30), acc('s2', 20, 30)], [machine('linux-box', 's1')]));
  assert.deepEqual(got, { kind: 'switch', host: 'linux-box', from: 's1', to: 's2', limit: 'fiveHour', pct: 91, window: `s1:fiveHour:${FIVE_RESET}` });
});

test('over the weekly threshold it goes too', () => {
  const got = decideRotation(input([onS1(10, 96), acc('s2', 20, 30)], [machine('linux-box', 's1')]));
  assert.deepEqual(got, { kind: 'switch', host: 'linux-box', from: 's1', to: 's2', limit: 'sevenDay', pct: 96, window: `s1:sevenDay:${WEEK_RESET}` });
});

test('an account no other machine uses comes before a less used one that another machine uses', () => {
  const got = decideRotation(input([onS1(95, 10), acc('s2', 40, 10, { activeOn: ['mac'] }), acc('s3', 60, 10)], [machine('linux-box', 's1')]));
  assert.equal(got?.kind === 'switch' && got.to, 's3');
});

test('among the free accounts, the one whose higher percentage is lowest', () => {
  const got = decideRotation(input([onS1(95, 10), acc('s2', 50, 10), acc('s3', 10, 30)], [machine('linux-box', 's1')]));
  assert.equal(got?.kind === 'switch' && got.to, 's3');
});

test('with no free account left, one another machine uses', () => {
  const got = decideRotation(input([onS1(95, 10), acc('s2', 40, 10, { activeOn: ['mac'] })], [machine('linux-box', 's1')]));
  assert.equal(got?.kind === 'switch' && got.to, 's2');
});

test('an account without a spare login, one that cannot be read and one without usage are not targets', () => {
  const got = decideRotation(input([onS1(95, 10), acc('s2', 10, 10, { spare: 0 }), acc('s3', 10, 10, { usable: false }), acc('s4', 0, 0, { usage: null })], [machine('linux-box', 's1')]));
  assert.equal(got?.kind, 'stuck');
});

test('a machine whose account has no reading is not decided', () => {
  assert.equal(decideRotation(input([acc('s1', 0, 0, { usage: null, activeOn: ['linux-box'] }), acc('s2', 10, 10)], [machine('linux-box', 's1')])), null);
  assert.equal(decideRotation(input([acc('s2', 10, 10)], [machine('linux-box', null)])), null);
});

test('with no account below the thresholds, too little difference keeps the machine where it is and warns', () => {
  const got = decideRotation(input([onS1(97, 10), acc('s2', 92, 10)], [machine('linux-box', 's1')]));
  assert.deepEqual(got, { kind: 'stuck', host: 'linux-box', from: 's1', limit: 'fiveHour', pct: 97, window: `s1:fiveHour:${FIVE_RESET}` });
});

test('with no account below the thresholds, one at least 10 points less used is taken', () => {
  const got = decideRotation(input([onS1(100, 10), acc('s2', 90, 50)], [machine('linux-box', 's1')]));
  assert.equal(got?.kind === 'switch' && got.to, 's2');
});

test('a switch to an account over a threshold names the window the target passed, and one below them names none', () => {
  const fallback = decideRotation(input([onS1(100, 10), acc('s2', 90, 50)], [machine('linux-box', 's1')]));
  assert.deepEqual(fallback?.kind === 'switch' && fallback.targetWindow, { limit: 'fiveHour', window: `s2:fiveHour:${FIVE_RESET}` });
  const below = decideRotation(input([onS1(100, 10), acc('s2', 20, 50)], [machine('linux-box', 's1')]));
  assert.equal(below?.kind === 'switch' && 'targetWindow' in below, false);
});

test('no target warns once per window, and again in the next one', () => {
  const accounts = [onS1(97, 10), acc('s2', 92, 10)];
  const memory = { left: {}, warned: { 'linux-box': { fiveHour: `s1:fiveHour:${FIVE_RESET}` } }, failed: {}, retryAt: {} };
  assert.equal(decideRotation(input(accounts, [machine('linux-box', 's1')], { memory })), null);
  const next = [acc('s1', 97, 10, { activeOn: ['linux-box'], spare: 0, usage: { five: 97, seven: 10, fiveReset: FIVE_RESET + 5 * 3600, sevenReset: WEEK_RESET } }), acc('s2', 92, 10)];
  assert.equal(decideRotation(input(next, [machine('linux-box', 's1')], { memory }))?.kind, 'stuck');
});

test('the account a machine just left is not a target while it stays over a threshold', () => {
  const memory = { left: { 'linux-box': 's1' }, warned: {}, failed: {}, retryAt: {} };
  const accounts = [acc('s2', 100, 10, { activeOn: ['linux-box'], spare: 0 }), acc('s1', 90, 10)];
  assert.equal(decideRotation(input(accounts, [machine('linux-box', 's2')], { memory }))?.kind, 'stuck');
  // Once below both thresholds again, it is an ordinary target.
  const reset = [acc('s2', 100, 10, { activeOn: ['linux-box'], spare: 0 }), acc('s1', 0, 10)];
  assert.equal(decideRotation(input(reset, [machine('linux-box', 's2')], { memory }))?.kind, 'switch');
});

test('a machine not connected is reported once per window instead of switched', () => {
  const accounts = [onS1(95, 10), acc('s2', 10, 10)];
  const got = decideRotation(input(accounts, [machine('linux-box', 's1', { connected: false })]));
  assert.deepEqual(got, { kind: 'offline', host: 'linux-box', from: 's1', to: 's2', limit: 'fiveHour', pct: 95, window: `s1:fiveHour:${FIVE_RESET}` });
  const memory = { left: {}, warned: {}, failed: { 'linux-box': { fiveHour: `s1:fiveHour:${FIVE_RESET}|sin conexión` } }, retryAt: {} };
  assert.equal(decideRotation(input(accounts, [machine('linux-box', 's1', { connected: false })], { memory })), null);
});

test("the hub's reading and a statusline's of one window, with resets a second apart, are the same window", () => {
  const memory = { left: {}, warned: { 'linux-box': { fiveHour: `s1:fiveHour:${FIVE_RESET}` } }, failed: { mac: { fiveHour: `s3:fiveHour:${FIVE_RESET}|sin conexión` } }, retryAt: {} };
  for (const reset of [FIVE_RESET - 1, FIVE_RESET + 1]) {
    const s1 = acc('s1', 97, 10, { activeOn: ['linux-box'], spare: 0, usage: { five: 97, seven: 10, fiveReset: reset, sevenReset: WEEK_RESET } });
    assert.equal(decideRotation(input([s1, acc('s2', 92, 10)], [machine('linux-box', 's1')], { memory })), null, 'no second warning');
    const s3 = acc('s3', 95, 10, { activeOn: ['mac'], spare: 0, usage: { five: 95, seven: 10, fiveReset: reset, sevenReset: WEEK_RESET } });
    assert.equal(decideRotation(input([s3, acc('s4', 10, 10)], [machine('mac', 's3', { connected: false })], { memory })), null, 'no second failure');
  }
});

test("a warning about one account does not silence another account's whose window resets at the same time", () => {
  const memory = { left: {}, warned: { 'linux-box': { fiveHour: `s1:fiveHour:${FIVE_RESET}` } }, failed: {}, retryAt: {} };
  const accounts = [acc('s2', 97, 10, { activeOn: ['linux-box'], spare: 0 }), acc('s3', 92, 10)];
  assert.equal(decideRotation(input(accounts, [machine('linux-box', 's2')], { memory }))?.kind, 'stuck');
});

test('a failure with another reason in the same window is reported', () => {
  const memory = { left: {}, warned: {}, failed: { 'linux-box': { fiveHour: `s1:fiveHour:${FIVE_RESET}|El Llavero no deja escribir` } }, retryAt: {} };
  const got = decideRotation(input([onS1(95, 10), acc('s2', 10, 10)], [machine('linux-box', 's1', { connected: false })], { memory }));
  assert.equal(got?.kind, 'offline');
});

test('a machine whose switch failed is not switched again until its retry time', () => {
  const memory = { left: {}, warned: {}, failed: {}, retryAt: { 'linux-box': NOW + 10 } };
  const accounts = [onS1(95, 10), acc('s2', 10, 10)];
  assert.equal(decideRotation(input(accounts, [machine('linux-box', 's1')], { memory })), null);
  assert.equal(decideRotation(input(accounts, [machine('linux-box', 's1')], { memory, now: NOW + 10 }))?.kind, 'switch');
});

test('a machine already handled in this round, or being switched, is passed over for the next one', () => {
  const accounts = [acc('s1', 95, 10, { activeOn: ['linux-box', 'mac'], spare: 0 }), acc('s2', 10, 10)];
  const machines = [machine('linux-box', 's1'), machine('mac', 's1')];
  assert.equal(decideRotation(input(accounts, machines, { skip: ['linux-box'] }))?.host, 'mac');
  assert.equal(decideRotation(input(accounts, [machine('linux-box', 's1', { switching: true }), machine('mac', 's1')]))?.host, 'mac');
});

// ---------------------------------------------------------------- the service

/**
 * A hub with accounts and machines, whose switch moves logins as AccountManager does:
 * the target's spare login goes to the machine, and the one it had comes back as spare.
 * Like AccountManager, it emits its change (a call to evaluate()) synchronously when a
 * switch starts and in the switch's finally, before its promise settles. The statusline
 * readings go through checkLimits, as index.ts does.
 */
function fakeHub(accounts: ClaudeAccount[], hosts: Record<string, string | null>, settings: AccountRotationSettings) {
  const state = { accounts, hosts, settings, connected: new Set(Object.keys(hosts)), now: NOW, limits: {} as Record<string, RateLimits[]> };
  const switches: [string, string][] = [];
  const reports: { host: string; event: ActivityAccount }[] = [];
  let failWith: string | null = null;
  let stays = false;
  let gate: Promise<void> | null = null;
  const info = (): AccountsInfo => ({
    list: state.accounts.map((a) => ({ ...a, activeOn: Object.keys(state.hosts).filter((h) => state.hosts[h] === a.id) })),
    hosts: { ...state.hosts },
    switching: [],
  });
  const snapshots = () => Object.keys(state.hosts).map((id) => ({ id, name: id, status: 'ok' as const, sessions: [], limits: state.limits[id] }));
  const rotation: AccountRotation = new AccountRotation({
    settings: () => state.settings,
    accounts: info,
    readings: () => [...checkLimits(snapshots(), info().list, state.now).kept.values()].flat(),
    machines: () => Object.keys(state.hosts).map((id) => ({ id, connected: state.connected.has(id) })),
    switchHost: (host, to) => {
      // Rounds that never end would switch without limit: past a few tries, fail without emitting the change that starts another round.
      if (switches.length >= 5) return Promise.reject(new Error('demasiados cambios'));
      void rotation.evaluate();
      const run = async () => {
        if (gate) await gate;
        switches.push([host, to]);
        if (failWith) throw new Error(failWith);
        if (stays) return;
        const from = state.hosts[host];
        state.accounts = state.accounts.map((a) => (a.id === to ? { ...a, spare: a.spare - 1 } : a.id === from ? { ...a, spare: a.spare + 1 } : a));
        state.hosts = { ...state.hosts, [host]: to };
      };
      return run().finally(() => void rotation.evaluate());
    },
    report: (host, event) => {
      // Rounds that never end would report without limit: fail instead of filling the memory.
      if (reports.length >= 20) throw new Error('demasiados avisos');
      reports.push({ host, event });
    },
    now: () => state.now,
  });
  return {
    state,
    switches,
    reports,
    rotation,
    fail: (msg: string | null) => (failWith = msg),
    /** The switch resolves but leaves the machine on its account. */
    stay: () => (stays = true),
    hold: () => {
      let release!: () => void;
      gate = new Promise((r) => (release = r));
      return () => {
        gate = null;
        release();
      };
    },
  };
}

/** Lets every round the events started run to its end. */
const settle = () => new Promise((r) => setTimeout(r, 20));

const ON = (hosts: string[]): AccountRotationSettings => ({ fiveHour: 90, sevenDay: 95, hosts });

test('a machine over a threshold is switched once and the switch is reported with the aliases, the limit and the percentage', async () => {
  const hub = fakeHub([account('s1', { alias: 'Personal', usage: hubUsage(91, 30), spare: 0 }), account('s2', { alias: 'Trabajo', usage: hubUsage(20, 30) })], { 'linux-box': 's1' }, ON(['linux-box']));
  await hub.rotation.evaluate();
  assert.deepEqual(hub.switches, [['linux-box', 's2']]);
  assert.deepEqual(hub.reports, [{ host: 'linux-box', event: { from: 'Personal', to: 'Trabajo', limit: 'fiveHour', pct: 91 } }]);
  // Decided again with the machine on s2: nothing more to do.
  await hub.rotation.evaluate();
  assert.equal(hub.switches.length, 1);
});

test('two machines on one account are decided one after the other, the second seeing the first switch', async () => {
  const hub = fakeHub([account('s1', { usage: hubUsage(95, 10), spare: 0 }), account('s2', { usage: hubUsage(10, 10), spare: 1 })], { 'linux-box': 's1', mac: 's1' }, ON(['linux-box', 'mac']));
  await hub.rotation.evaluate();
  assert.deepEqual(hub.switches, [['linux-box', 's2']]);
  assert.deepEqual(hub.reports, [
    { host: 'linux-box', event: { from: 's1', to: 's2', limit: 'fiveHour', pct: 95 } },
    { host: 'mac', event: { from: 's1', limit: 'fiveHour', pct: 95 } },
  ]);
  // mac still has no target in the same window: no second warning.
  await hub.rotation.evaluate();
  assert.equal(hub.reports.length, 2);
});

test('a machine is not sent back to the account it just left while that one stays over a threshold', async () => {
  const hub = fakeHub([account('s1', { usage: hubUsage(100, 10), spare: 0 }), account('s2', { usage: hubUsage(10, 10) })], { 'linux-box': 's1' }, ON(['linux-box']));
  await hub.rotation.evaluate();
  assert.deepEqual(hub.switches, [['linux-box', 's2']]);
  // Now s2 is spent and s1, still over its threshold, is 10 points less used.
  hub.state.accounts = hub.state.accounts.map((a) => (a.id === 's2' ? { ...a, usage: hubUsage(100, 10) } : { ...a, usage: hubUsage(90, 10) }));
  await hub.rotation.evaluate();
  assert.deepEqual(hub.switches, [['linux-box', 's2']]);
  assert.deepEqual(hub.reports[1], { host: 'linux-box', event: { from: 's2', limit: 'fiveHour', pct: 100 } });
});

test('a switch that keeps failing is tried once per event and again after 5 minutes, and reported once', async () => {
  const hub = fakeHub([account('s1', { usage: hubUsage(95, 10), spare: 0 }), account('s2', { usage: hubUsage(10, 10) })], { 'linux-box': 's1' }, ON(['linux-box']));
  hub.fail('El Llavero no deja escribir');
  await hub.rotation.evaluate();
  await settle();
  assert.equal(hub.switches.length, 1, 'the change the failed switch emits does not try it again');
  // The usage and the machine change several times within the minute.
  for (const t of [10, 20, 50]) {
    hub.state.now = NOW + t;
    await hub.rotation.evaluate();
  }
  await settle();
  assert.equal(hub.switches.length, 1);
  assert.deepEqual(hub.reports, [{ host: 'linux-box', event: { from: 's1', to: 's2', limit: 'fiveHour', pct: 95, error: 'El Llavero no deja escribir' } }]);
  hub.state.now = NOW + 300;
  await hub.rotation.evaluate();
  await settle();
  assert.equal(hub.switches.length, 2, 'tried again after 5 minutes');
  assert.equal(hub.reports.length, 1, 'the same failure in the same window is not reported again');
  hub.fail(null);
  hub.state.now = NOW + 600;
  await hub.rotation.evaluate();
  assert.deepEqual(hub.reports[1], { host: 'linux-box', event: { from: 's1', to: 's2', limit: 'fiveHour', pct: 95 } });
});

test('a failure with another reason is reported too', async () => {
  const hub = fakeHub([account('s1', { usage: hubUsage(95, 10), spare: 0 }), account('s2', { usage: hubUsage(10, 10) })], { 'linux-box': 's1' }, ON(['linux-box']));
  hub.state.connected.clear();
  await hub.rotation.evaluate();
  hub.state.connected.add('linux-box');
  hub.fail('El Llavero no deja escribir');
  await hub.rotation.evaluate();
  await settle();
  hub.fail('El login guardado de s2 ya no vale: inicia sesión otra vez');
  hub.state.now = NOW + 300;
  await hub.rotation.evaluate();
  await settle();
  assert.deepEqual(
    hub.reports.map((r) => r.event.error),
    ['sin conexión', 'El Llavero no deja escribir', 'El login guardado de s2 ya no vale: inicia sesión otra vez'],
  );
});

test("a change of the machine's account by hand forgets the failure, so the next one is tried at once and reported", async () => {
  const hub = fakeHub(
    [account('s1', { usage: hubUsage(95, 10), spare: 0 }), account('s2', { usage: hubUsage(10, 10) }), account('s3', { usage: hubUsage(30, 10) })],
    { 'linux-box': 's1' },
    ON(['linux-box']),
  );
  hub.fail('El Llavero no deja escribir');
  await hub.rotation.evaluate();
  await settle();
  // The owner moves it to s3 from the panel and back to s1, in the same window.
  hub.state.hosts = { 'linux-box': 's3' };
  await hub.rotation.evaluate();
  hub.state.hosts = { 'linux-box': 's1' };
  hub.state.now = NOW + 30;
  await hub.rotation.evaluate();
  await settle();
  assert.equal(hub.switches.length, 2, 'no 5-minute wait after the account changed');
  assert.equal(hub.reports.length, 2);
  assert.equal(hub.reports[1].event.error, 'El Llavero no deja escribir');
});

test('no warning of no target follows a switch to an account over a threshold, until the next window', async () => {
  const hub = fakeHub([account('s1', { usage: hubUsage(100, 10), spare: 0 }), account('s2', { usage: hubUsage(90, 50) })], { 'linux-box': 's1' }, ON(['linux-box']));
  await hub.rotation.evaluate();
  await hub.rotation.evaluate();
  await settle();
  assert.deepEqual(hub.reports, [{ host: 'linux-box', event: { from: 's1', to: 's2', limit: 'fiveHour', pct: 100 } }]);
  // s2's window resets and, in the next one, it passes the threshold again with no target.
  const next = FIVE_RESET + 5 * 3600;
  hub.state.accounts = hub.state.accounts.map((a) => ({ ...a, usage: hubUsage(a.id === 's2' ? 92 : 100, 50, NOW - 240, next) }));
  await hub.rotation.evaluate();
  assert.deepEqual(hub.reports[1], { host: 'linux-box', event: { from: 's2', limit: 'fiveHour', pct: 92 } });
});

test('over both thresholds with no target, a 5-hour usage that crosses its threshold up and down warns once per limit', async () => {
  const hub = fakeHub([account('s1', { usage: hubUsage(91, 96), spare: 0 }), account('s2', { usage: hubUsage(97, 97) })], { 'linux-box': 's1' }, ON(['linux-box']));
  for (const five of [91, 85, 91, 85, 91]) {
    hub.state.accounts = hub.state.accounts.map((a) => (a.id === 's1' ? { ...a, usage: hubUsage(five, 96) } : a));
    await hub.rotation.evaluate();
  }
  assert.deepEqual(
    hub.reports.map((r) => r.event.limit),
    ['fiveHour', 'sevenDay'],
  );
});

test('a statusline reading the hub keeps decides; one it treats as foreign does not', async () => {
  const hub = fakeHub([account('s1', { usage: hubUsage(50, 10), spare: 0 }), account('s2', { usage: hubUsage(10, 10) })], { 'linux-box': 's1' }, ON(['linux-box']));
  // 97 % with a 5-hour reset two hours away from the hub's: another account's window.
  const foreign: UsageWindow = { pct: 97, resetsAt: FIVE_RESET + 2 * 3600 };
  hub.state.limits = { 'linux-box': [{ ...reading('s1@example.com', 97, 10), fiveHour: foreign }] };
  await hub.rotation.evaluate();
  assert.deepEqual(hub.switches, []);
  hub.state.limits = { 'linux-box': [reading('s1@example.com', 92, 10)] };
  await hub.rotation.evaluate();
  assert.deepEqual(hub.switches, [['linux-box', 's2']]);
});

test('a switch that leaves the machine on its account is not repeated in the same round', async () => {
  const hub = fakeHub([account('s1', { usage: hubUsage(95, 10), spare: 0 }), account('s2', { usage: hubUsage(10, 10) })], { 'linux-box': 's1' }, ON(['linux-box']));
  hub.stay();
  await hub.rotation.evaluate();
  assert.equal(hub.switches.length, 1);
});

test('a machine not connected is reported once and not switched', async () => {
  const hub = fakeHub([account('s1', { usage: hubUsage(95, 10), spare: 0 }), account('s2', { usage: hubUsage(10, 10) })], { 'linux-box': 's1' }, ON(['linux-box']));
  hub.state.connected.clear();
  await hub.rotation.evaluate();
  await hub.rotation.evaluate();
  assert.deepEqual(hub.switches, []);
  assert.deepEqual(hub.reports, [{ host: 'linux-box', event: { from: 's1', to: 's2', limit: 'fiveHour', pct: 95, error: 'sin conexión' } }]);
});

test('calls while a decision runs join it, and what changed meanwhile is decided in it', async () => {
  const hub = fakeHub(
    [account('s1', { usage: hubUsage(95, 10), spare: 0 }), account('s2', { usage: hubUsage(10, 10) }), account('s3', { usage: hubUsage(20, 10) }), account('s4', { usage: hubUsage(5, 5) })],
    { 'linux-box': 's1', mac: 's3' },
    ON(['linux-box']),
  );
  const release = hub.hold();
  const first = hub.rotation.evaluate();
  // While linux-box is being switched, mac's account passes the threshold and its switch is turned on.
  hub.state.accounts = hub.state.accounts.map((a) => (a.id === 's3' ? { ...a, usage: hubUsage(99, 10), spare: 0 } : a));
  hub.state.settings = ON(['linux-box', 'mac']);
  const second = hub.rotation.evaluate();
  const third = hub.rotation.evaluate();
  release();
  await Promise.all([first, second, third]);
  assert.deepEqual(hub.switches, [
    ['linux-box', 's4'],
    ['mac', 's2'],
  ]);
});

test('the percentage reported is a whole number, as the panel shows it', async () => {
  const hub = fakeHub([account('s1', { usage: hubUsage(91.37, 30), spare: 0 }), account('s2', { usage: hubUsage(20, 30) })], { 'linux-box': 's1' }, ON(['linux-box']));
  await hub.rotation.evaluate();
  assert.equal(hub.reports[0].event.pct, 91);
});

test('the push of a switch, of no account with margin and of a failure names the machine, the accounts and the limit with its percentage', () => {
  const done = rotationNotice('linux-box', { from: 'Personal', to: 'Trabajo', limit: 'fiveHour', pct: 91 });
  const stuck = rotationNotice('mac', { from: 'Trabajo', limit: 'sevenDay', pct: 97 });
  const failed = rotationNotice('mac', { from: 'Trabajo', to: 'Personal', limit: 'sevenDay', pct: 97, error: 'sin conexión' });
  for (const part of ['linux-box', 'Trabajo']) assert.ok(done.title.includes(part), part);
  for (const part of ['Personal', 'Trabajo', '5 h', '91 %']) assert.ok(done.body.includes(part), part);
  assert.ok(stuck.title.includes('mac'));
  for (const part of ['Trabajo', 'semanal', '97 %']) assert.ok(stuck.body.includes(part), part);
  assert.ok(failed.title.includes('mac'));
  for (const part of ['Trabajo', 'Personal', 'sin conexión']) assert.ok(failed.body.includes(part), part);
  assert.equal(new Set([done.title.replace('linux-box', ''), stuck.title.replace('mac', ''), failed.title.replace('mac', '')]).size, 3, 'three different titles');
});
