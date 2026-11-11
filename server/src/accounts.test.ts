import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { AccountStore, NeedsLoginError, type HostLogin } from './account-store.js';
import { parseProfile, parseUsage, planName, splitCode, startLogin, type OAuthCred } from './claude-oauth.js';
import type { TmuxExec } from './exec.js';
import { inspectHost, parseSnapshot, switchedDocs, switchHost } from './host-creds.js';

function withDir(fn: (dir: string) => void | Promise<void>): () => Promise<void> {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), 'twb-accounts-'));
    try {
      await fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

function cred(name: string, expiresIn = 3600_000): OAuthCred {
  return { accessToken: `at-${name}`, refreshToken: `rt-${name}`, expiresAt: Date.now() + expiresIn, scopes: ['user:inference', 'user:profile'] };
}

function oauthAccount(n: string) {
  return { accountUuid: `acc-${n}`, organizationUuid: `org-${n}`, emailAddress: `${n}@example.com` };
}

function seen(n: string, c = cred(n)): HostLogin {
  return { oauthAccount: oauthAccount(n), cred: c };
}

// ---------------------------------------------------------------- store

test('a machine logged in with an unknown account brings it in, its login on that machine', withDir((dir) => {
  const store = new AccountStore(dir);
  const c = cred('max');
  assert.equal(store.observe('mac', seen('max', c)), true);
  const acc = store.get('acc-max:org-max')!;
  assert.equal(acc.alias, 'max');
  assert.equal(acc.email, 'max@example.com');
  assert.deepEqual(acc.logins.map((l) => l.host), ['mac']);
  assert.equal(store.hostAccount('mac'), 'acc-max:org-max');
  // Looked at again with nothing new: nothing changes.
  assert.equal(store.observe('mac', seen('max', { ...c })), false);
}));

test('the accounts and logins survive a restart, in a file only the hub can read', withDir((dir) => {
  new AccountStore(dir).observe('mac', seen('max'));
  const file = join(dir, 'accounts.json');
  assert.equal(statSync(file).mode & 0o777, 0o600);
  const again = new AccountStore(dir);
  assert.equal(again.get('acc-max:org-max')?.logins[0].cred.refreshToken, 'rt-max');
}));

test('an unreadable accounts file stops the hub instead of dropping every login', withDir((dir) => {
  writeFileSync(join(dir, 'accounts.json'), '{oops');
  assert.throws(() => new AccountStore(dir), /No se puede leer/);
}));

test('a machine whose Claude renewed its login keeps the hub copy current', withDir((dir) => {
  const store = new AccountStore(dir);
  store.observe('mac', seen('max'));
  store.observe('mac', seen('max', { ...cred('max'), accessToken: 'at-new', refreshToken: 'rt-new' }));
  const logins = store.get('acc-max:org-max')!.logins;
  assert.equal(logins.length, 1);
  assert.equal(logins[0].cred.refreshToken, 'rt-new');
}));

test('the same account on two machines is two logins, one on each', withDir((dir) => {
  const store = new AccountStore(dir);
  store.observe('mac', seen('max', cred('max-a')));
  store.observe('ct', seen('max', cred('max-b')));
  const acc = store.get('acc-max:org-max')!;
  assert.deepEqual(acc.logins.map((l) => l.host).sort(), ['ct', 'mac']);
  assert.equal(store.info([]).list[0].activeOn.sort().join(), 'ct,mac');
}));

test('a /login by hand to another account leaves the old login as spare', withDir((dir) => {
  const store = new AccountStore(dir);
  store.observe('mac', seen('max'));
  store.observe('mac', seen('team'));
  assert.equal(store.get('acc-max:org-max')!.logins[0].host, null);
  assert.equal(store.get('acc-team:org-team')!.logins[0].host, 'mac');
  assert.equal(store.info([]).list.find((a) => a.alias === 'max')!.spare, 1);
}));

test('a logged out machine has no account, and its login comes back as spare', withDir((dir) => {
  const store = new AccountStore(dir);
  store.observe('mac', seen('max'));
  store.observe('mac', { oauthAccount: null, cred: null });
  assert.equal(store.hostAccount('mac'), null);
  assert.equal(store.get('acc-max:org-max')!.logins[0].host, null);
}));

test('a switch takes back what the machine had and gives it the spare login', withDir((dir) => {
  const store = new AccountStore(dir);
  store.observe('mac', seen('max'));
  store.addLogin(oauthAccount('team'), cred('team'), { alias: 'team-bm', plan: 'Team' });
  const spare = store.spareLogin('acc-team:org-team');
  // The machine's Claude renewed the max login since it was last looked at.
  const outgoing = seen('max', { ...cred('max'), refreshToken: 'rt-max-2' });
  store.commitSwitch('mac', outgoing, spare.id, spare.cred);
  const max = store.get('acc-max:org-max')!;
  assert.equal(max.logins.length, 1);
  assert.equal(max.logins[0].host, null);
  assert.equal(max.logins[0].cred.refreshToken, 'rt-max-2');
  assert.equal(store.get('acc-team:org-team')!.logins[0].host, 'mac');
  assert.equal(store.hostAccount('mac'), 'acc-team:org-team');
  assert.equal(store.get('acc-team:org-team')!.alias, 'team-bm');
}));

test('a login on a machine is never handed to another one', withDir((dir) => {
  const store = new AccountStore(dir);
  store.observe('mac', seen('max'));
  assert.throws(() => store.spareLogin('acc-max:org-max'), NeedsLoginError);
}));

test('a dead login is not handed out, and the account asks for a new one', withDir((dir) => {
  const store = new AccountStore(dir);
  const acc = store.addLogin(oauthAccount('max'), cred('max'), {});
  store.markDead(acc.logins[0].id);
  assert.throws(() => store.spareLogin(acc.id), NeedsLoginError);
  assert.equal(store.info([]).list[0].needsLogin, true);
}));

test('a login seen back on a machine is not also kept as spare', withDir((dir) => {
  const store = new AccountStore(dir);
  const acc = store.addLogin(oauthAccount('max'), cred('max'), {});
  // The switch wrote it, but its answer got lost: the next look finds it there.
  store.observe('ct', seen('max'));
  assert.equal(acc.logins.length, 1);
  assert.equal(store.get(acc.id)!.logins[0].host, 'ct');
  assert.equal(store.info([]).list[0].spare, 0);
}));

test('aliases are unique; an account in use cannot be removed', withDir((dir) => {
  const store = new AccountStore(dir);
  store.observe('mac', seen('max'));
  store.addLogin({ ...oauthAccount('other'), emailAddress: 'max@other.com' }, cred('o'), {});
  assert.equal(store.get('acc-other:org-other')!.alias, 'max-2');
  assert.throws(() => store.rename('acc-other:org-other', 'max'), /Ya hay/);
  store.rename('acc-other:org-other', 'team-tdl');
  assert.throws(() => store.remove('acc-max:org-max'), /La usa mac/);
  store.remove('acc-other:org-other');
  assert.equal(store.get('acc-other:org-other'), undefined);
}));

test('the panel never gets a token', withDir((dir) => {
  const store = new AccountStore(dir);
  store.observe('mac', seen('max'));
  assert.doesNotMatch(JSON.stringify(store.info([])), /rt-max|at-max/);
}));

// ---------------------------------------------------------------- Anthropic answers

test('usage: 5 h, 7 d and the weekly limit of each model', () => {
  const u = parseUsage(
    {
      five_hour: { utilization: 28.0, resets_at: '2026-11-11T13:30:00.027495+00:00' },
      seven_day: { utilization: 9.0, resets_at: '2026-11-16T08:00:00+00:00' },
      limits: [
        { kind: 'session', percent: 28, resets_at: '2026-11-11T13:30:00+00:00', scope: null },
        { kind: 'weekly_scoped', percent: 75, resets_at: '2026-11-16T08:00:00+00:00', scope: { model: { id: null, display_name: 'Fable' } } },
      ],
    },
    100,
  );
  assert.deepEqual(u, {
    t: 100,
    fiveHour: { pct: 28, resetsAt: Date.parse('2026-11-11T13:30:00.027Z') / 1000 | 0 },
    sevenDay: { pct: 9, resetsAt: Date.parse('2026-11-16T08:00:00Z') / 1000 },
    models: [{ name: 'Fable', pct: 75, resetsAt: Date.parse('2026-11-16T08:00:00Z') / 1000 }],
  });
  assert.deepEqual(parseUsage({ five_hour: null, seven_day: null }, 1), { t: 1, fiveHour: undefined, sevenDay: undefined, models: [] });
});

test('profile: who, which organization, which plan', () => {
  const p = parseProfile({
    account: { uuid: 'a1', email: 'x@y.com', display_name: 'X', full_name: 'X Y', created_at: '2025-01-01' },
    organization: { uuid: 'o1', name: 'Org', organization_type: 'claude_max', rate_limit_tier: 'default_claude_max_5x', billing_type: 'stripe_subscription' },
  });
  assert.equal(p.plan, 'Max 5x');
  assert.equal(p.subscriptionType, 'max');
  assert.deepEqual(p.oauthAccount, {
    accountUuid: 'a1',
    emailAddress: 'x@y.com',
    organizationUuid: 'o1',
    organizationName: 'Org',
    displayName: 'X',
    fullName: 'X Y',
    billingType: 'stripe_subscription',
    organizationType: 'claude_max',
    organizationRateLimitTier: 'default_claude_max_5x',
    accountCreatedAt: '2025-01-01',
  });
  assert.equal(planName('claude_team', 'default_claude_max_5x'), 'Team');
  assert.equal(planName('claude_max', 'default_claude_max_20x'), 'Max 20x');
  assert.equal(planName(undefined, undefined), undefined);
});

test('the pasted code drops the state the page appends, and a login URL has PKCE', () => {
  assert.deepEqual(splitCode('  abc#xyz \n'), { code: 'abc', state: 'xyz' });
  assert.deepEqual(splitCode('abc'), { code: 'abc', state: undefined });
  const p = startLogin();
  const url = new URL(p.url);
  assert.equal(url.searchParams.get('state'), p.state);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.notEqual(url.searchParams.get('code_challenge'), p.verifier);
});

// ---------------------------------------------------------------- the machine's side

test('documents of a switch: only the login and the account change', () => {
  const snap = parseSnapshot(
    `OS Linux\nCRED ${Buffer.from(JSON.stringify({ claudeAiOauth: cred('max'), mcpOAuth: { s: 1 } })).toString('base64')}\nCONF \nREADY\n`,
  );
  assert.equal(snap.config, null);
  assert.equal(snap.cred?.refreshToken, 'rt-max');
  const team = cred('team');
  const docs = switchedDocs({ ...snap, config: { numStartups: 3, oauthAccount: { ...oauthAccount('max'), seatTier: 'x' } } }, team, oauthAccount('team'));
  assert.deepEqual(JSON.parse(docs.creds), { claudeAiOauth: team, mcpOAuth: { s: 1 } });
  // No field of the old account survives.
  assert.deepEqual(JSON.parse(docs.config), { numStartups: 3, oauthAccount: oauthAccount('team') });
});

test('a password the Keychain hands back as hex is read too', () => {
  const hex = Buffer.from(JSON.stringify({ claudeAiOauth: cred('max') })).toString('hex');
  const snap = parseSnapshot(`OS Darwin\nCRED ${Buffer.from(hex).toString('base64')}\nCONF \n`);
  assert.equal(snap.cred?.accessToken, 'at-max');
});

test('a script error comes back as a sentence', () => {
  assert.throws(() => parseSnapshot('OS Linux\nERR lock /x\n'), /ocupados/);
});

/**
 * Runs the real script with /bin/sh in a made-up HOME: it only touches files there
 * (no tmux), so nothing of this machine's own Claude Code is at stake.
 */
function fakeExec(home: string, bin?: string): TmuxExec {
  const env = { ...process.env, HOME: home, USER: 'tester', ...(bin ? { PATH: `${bin}:${process.env.PATH}` } : {}) };
  return {
    shell: (script: string) =>
      new Promise<string>((resolve, reject) =>
        execFile('/bin/sh', ['-c', script], { env, encoding: 'utf8' }, (err, out, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(out))),
      ),
    spawnShell: (script: string) => spawn('/bin/sh', ['-c', script], { env, stdio: ['pipe', 'pipe', 'pipe'] }),
  } as unknown as TmuxExec;
}

function fakeHome(dir: string) {
  mkdirSync(join(dir, '.claude'));
  writeFileSync(join(dir, '.claude', '.credentials.json'), JSON.stringify({ claudeAiOauth: cred('max'), mcpOAuth: { srv: { token: 't' } } }), { mode: 0o600 });
  writeFileSync(join(dir, '.claude.json'), JSON.stringify({ numStartups: 5, oauthAccount: oauthAccount('max'), projects: { '/x': {} } }, null, 2));
}

test('inspect reads the login and the account of a Linux machine', withDir(async (dir) => {
  if (process.platform !== 'linux') return;
  fakeHome(dir);
  const snap = await inspectHost(fakeExec(dir));
  assert.equal(snap.os, 'Linux');
  assert.equal(snap.cred?.refreshToken, 'rt-max');
  assert.deepEqual(snap.oauthAccount, oauthAccount('max'));
}));

test('inspect of a machine never logged in: nothing, without failing', withDir(async (dir) => {
  if (process.platform !== 'linux') return;
  const snap = await inspectHost(fakeExec(dir));
  assert.equal(snap.cred, null);
  assert.equal(snap.oauthAccount, null);
}));

test('a switch writes the new login and account, keeps the rest, and lets the locks go', withDir(async (dir) => {
  if (process.platform !== 'linux') return;
  fakeHome(dir);
  // A lock left behind by a Claude that died a while ago does not block it.
  const stale = join(dir, '.claude.json.lock');
  mkdirSync(stale);
  utimesSync(stale, new Date(Date.now() - 5 * 60_000), new Date(Date.now() - 5 * 60_000));
  const { snap, written } = await switchHost(fakeExec(dir), () => ({ cred: cred('team'), oauthAccount: oauthAccount('team') }));
  assert.equal(written, true);
  assert.equal(snap.cred?.refreshToken, 'rt-max');
  const creds = JSON.parse(readFileSync(join(dir, '.claude', '.credentials.json'), 'utf8'));
  assert.equal(creds.claudeAiOauth.refreshToken, 'rt-team');
  assert.deepEqual(creds.mcpOAuth, { srv: { token: 't' } });
  assert.equal(statSync(join(dir, '.claude', '.credentials.json')).mode & 0o777, 0o600);
  const config = JSON.parse(readFileSync(join(dir, '.claude.json'), 'utf8'));
  assert.deepEqual(config.oauthAccount, oauthAccount('team'));
  assert.equal(config.numStartups, 5);
  assert.deepEqual(config.projects, { '/x': {} });
  for (const lock of ['.claude/.oauth_refresh.lock', '.claude.lock', '.claude.json.lock']) assert.equal(existsSync(join(dir, lock)), false, lock);
}));

test('a switch through a symlinked config writes its target', withDir(async (dir) => {
  if (process.platform !== 'linux') return;
  fakeHome(dir);
  mkdirSync(join(dir, 'dotfiles'));
  writeFileSync(join(dir, 'dotfiles', 'claude.json'), readFileSync(join(dir, '.claude.json')));
  rmSync(join(dir, '.claude.json'));
  symlinkSync(join(dir, 'dotfiles', 'claude.json'), join(dir, '.claude.json'));
  await switchHost(fakeExec(dir), () => ({ cred: cred('team'), oauthAccount: oauthAccount('team') }));
  assert.equal(lstatSync(join(dir, '.claude.json')).isSymbolicLink(), true);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'dotfiles', 'claude.json'), 'utf8')).oauthAccount, oauthAccount('team'));
}));

test('a switch the hub calls off writes nothing', withDir(async (dir) => {
  if (process.platform !== 'linux') return;
  fakeHome(dir);
  const before = readFileSync(join(dir, '.claude', '.credentials.json'), 'utf8');
  const { written } = await switchHost(fakeExec(dir), () => null);
  assert.equal(written, false);
  assert.equal(readFileSync(join(dir, '.claude', '.credentials.json'), 'utf8'), before);
  assert.equal(existsSync(join(dir, '.claude.lock')), false);
}));

test('a Mac whose Keychain refuses the hub (SSH) switches through the file, as Claude Code does', withDir(async (dir) => {
  if (process.platform !== 'linux') return;
  const home = join(dir, 'home');
  const bin = join(dir, 'bin');
  mkdirSync(home);
  mkdirSync(bin);
  fakeHome(home);
  // A made-up macOS: uname says Darwin and the Keychain answers as it does over SSH.
  writeFileSync(join(bin, 'uname'), '#!/bin/sh\necho Darwin\n', { mode: 0o755 });
  writeFileSync(join(bin, 'security'), '#!/bin/sh\necho "security: SecKeychainItemCreateFromContent (<default>): User interaction is not allowed." >&2\nexit 36\n', { mode: 0o755 });
  const snap = await inspectHost(fakeExec(home, bin));
  assert.equal(snap.os, 'Darwin');
  assert.equal(snap.store, 'file');
  assert.equal(snap.cred?.refreshToken, 'rt-max');
  const { written } = await switchHost(fakeExec(home, bin), () => ({ cred: cred('team'), oauthAccount: oauthAccount('team') }));
  assert.equal(written, true);
  const creds = JSON.parse(readFileSync(join(home, '.claude', '.credentials.json'), 'utf8'));
  assert.equal(creds.claudeAiOauth.refreshToken, 'rt-team');
  assert.deepEqual(creds.mcpOAuth, { srv: { token: 't' } });
}));

test('a Mac whose Keychain answers is switched in the Keychain, and its file is left alone', withDir(async (dir) => {
  if (process.platform !== 'linux') return;
  const home = join(dir, 'home');
  const bin = join(dir, 'bin');
  mkdirSync(home);
  mkdirSync(bin);
  fakeHome(home);
  const fileBefore = readFileSync(join(home, '.claude', '.credentials.json'), 'utf8');
  writeFileSync(join(home, 'kc'), JSON.stringify({ claudeAiOauth: cred('pro') }));
  writeFileSync(join(bin, 'uname'), '#!/bin/sh\necho Darwin\n', { mode: 0o755 });
  // A Keychain that answers: reads come from ~/kc, `security -i` leaves its input in ~/kc.in.
  writeFileSync(join(bin, 'security'), '#!/bin/sh\ncase "$1" in find-generic-password) cat "$HOME/kc";; -i) cat > "$HOME/kc.in";; *) exit 1;; esac\n', { mode: 0o755 });
  const { snap, written } = await switchHost(fakeExec(home, bin), () => ({ cred: cred('team'), oauthAccount: oauthAccount('team') }));
  assert.equal(written, true);
  assert.equal(snap.store, 'keychain');
  assert.equal(snap.cred?.refreshToken, 'rt-pro');
  const cmd = readFileSync(join(home, 'kc.in'), 'utf8');
  const hex = /-s "Claude Code-credentials" -X "([0-9a-f]+)"/.exec(cmd)?.[1];
  assert.ok(cmd.startsWith('add-generic-password -U -a "tester"') && hex, cmd);
  assert.equal(JSON.parse(Buffer.from(hex, 'hex').toString('utf8')).claudeAiOauth.refreshToken, 'rt-team');
  assert.equal(readFileSync(join(home, '.claude', '.credentials.json'), 'utf8'), fileBefore);
}));
