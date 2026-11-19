import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mock, test } from 'node:test';
import { AccountStore, NeedsLoginError, type HostLogin } from './account-store.js';
import { AccountManager } from './accounts.js';
import { type Fetch, parseProfile, parseUsage, planName, splitCode, startLogin, type OAuthCred } from './claude-oauth.js';
import type { TmuxExec } from './exec.js';
import { inspectHost, parseSnapshot, switchedDocs, switchHost } from './host-creds.js';
import type { HostMonitor } from './host.js';

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

/** A machine whose ~/.claude.json names s1 while its login is of s2 (the owner's Mac on 2026-11-19). */
const mixed = (): HostLogin => ({ oauthAccount: oauthAccount('s1'), cred: cred('s2') });

test('a login whose profile names another account moves there, confirmed, creating that account', withDir((dir) => {
  const store = new AccountStore(dir);
  store.addLogin(oauthAccount('s1'), cred('s1'), {});
  store.observe('mac', mixed());
  store.observe('mac', { oauthAccount: null, cred: null });
  const wrong = store.get('acc-s1:org-s1')!.logins.find((l) => l.cred.refreshToken === 'rt-s2')!;
  assert.equal(wrong.confirmed, undefined);
  store.moveLogin(wrong.id, oauthAccount('s2'));
  assert.deepEqual(store.get('acc-s1:org-s1')!.logins.map((l) => l.cred.refreshToken), ['rt-s1']);
  const again = new AccountStore(dir);
  const s2 = again.get('acc-s2:org-s2')!;
  assert.equal(s2.email, 's2@example.com');
  assert.deepEqual(s2.logins.map((l) => [l.cred.refreshToken, l.host, l.confirmed]), [['rt-s2', null, true]]);
}));

test("moving a machine's login shows the machine on the account it moved to, and the next look keeps it there", withDir((dir) => {
  const store = new AccountStore(dir);
  store.observe('mac', mixed());
  store.moveLogin(store.get('acc-s1:org-s1')!.logins[0].id, oauthAccount('s2'));
  assert.equal(store.hostAccount('mac'), 'acc-s2:org-s2');
  // Its ~/.claude.json still names s1: the confirmed login stays where it belongs.
  store.observe('mac', mixed());
  assert.equal(store.hostAccount('mac'), 'acc-s2:org-s2');
  assert.deepEqual(store.get('acc-s1:org-s1')!.logins, []);
  const s2 = store.get('acc-s2:org-s2')!;
  assert.deepEqual(s2.logins.map((l) => [l.host, l.confirmed]), [['mac', true]]);
  assert.deepEqual(store.info([]).list.find((a) => a.id === 'acc-s2:org-s2')!.activeOn, ['mac']);
}));

/** The mixed machine, its login moved to s2, after its Claude Code renewed it (a new refresh token). */
function movedAndRenewed(dir: string): AccountStore {
  const store = new AccountStore(dir);
  store.observe('mac', mixed());
  store.moveLogin(store.get('acc-s1:org-s1')!.logins[0].id, oauthAccount('s2'));
  store.observe('mac', { oauthAccount: oauthAccount('s1'), cred: { ...cred('s2'), accessToken: 'at-s2-b', refreshToken: 'rt-s2-b' } });
  return store;
}

const refreshTokens = (store: AccountStore) => store.info([]).list.flatMap((a) => store.get(a.id)!.logins.map((l) => l.cred.refreshToken));

test("a moved machine login renewed by its machine stays on the account it moved to, and the spent token is kept nowhere", withDir((dir) => {
  const store = movedAndRenewed(dir);
  assert.equal(store.hostAccount('mac'), 'acc-s2:org-s2');
  assert.deepEqual(store.get('acc-s2:org-s2')!.logins.map((l) => [l.cred.refreshToken, l.host, l.confirmed]), [['rt-s2-b', 'mac', false]]);
  assert.deepEqual(refreshTokens(store), ['rt-s2-b']);
}));

test('a switch away from a renewed moved login takes the renewed one back as spare, never the spent one', withDir((dir) => {
  const store = movedAndRenewed(dir);
  const s3 = store.addLogin(oauthAccount('s3'), cred('s3'), {});
  store.commitSwitch('mac', { oauthAccount: oauthAccount('s1'), cred: { ...cred('s2'), accessToken: 'at-s2-c', refreshToken: 'rt-s2-c' } }, s3.logins[0].id, cred('s3'));
  assert.equal(store.hostAccount('mac'), 'acc-s3:org-s3');
  assert.equal(store.spareLogin('acc-s2:org-s2').cred.refreshToken, 'rt-s2-c');
  assert.deepEqual(refreshTokens(store).sort(), ['rt-s2-c', 'rt-s3']);
}));

test('a /login by hand on a machine whose login was moved files the new login by its ~/.claude.json and keeps the old one as spare', withDir((dir) => {
  const store = new AccountStore(dir);
  store.observe('mac', mixed());
  store.moveLogin(store.get('acc-s1:org-s1')!.logins[0].id, oauthAccount('s2'));
  store.observe('mac', seen('s3'));
  assert.equal(store.hostAccount('mac'), 'acc-s3:org-s3');
  assert.deepEqual(store.get('acc-s2:org-s2')!.logins.map((l) => [l.cred.refreshToken, l.host, l.configAccount]), [['rt-s2', null, undefined]]);
}));

test('a new token from a machine must be confirmed again; a renewal by the hub or a login from the panel need not', withDir((dir) => {
  const store = new AccountStore(dir);
  store.observe('mac', seen('max'));
  const login = store.get('acc-max:org-max')!.logins[0];
  store.confirm(login.id);
  store.observe('mac', seen('max', { ...cred('max'), refreshToken: 'rt-max-2' }));
  assert.equal(store.get('acc-max:org-max')!.logins[0].confirmed, false);
  const team = store.addLogin(oauthAccount('team'), cred('team'), {});
  assert.equal(team.logins[0].confirmed, true);
  store.updateCred(team.logins[0].id, { ...cred('team'), refreshToken: 'rt-team-2' });
  assert.equal(store.get(team.id)!.logins[0].confirmed, true);
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
function fakeExec(home: string, bin?: string, tmux = 'false'): TmuxExec {
  const env = { ...process.env, HOME: home, USER: 'tester', ...(bin ? { PATH: `${bin}:${process.env.PATH}` } : {}) };
  return {
    tmuxCommand: tmux,
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

/**
 * The part of a fake tmux that answers `show-environment -g CLAUDE_CONFIG_DIR` as tmux
 * does: `NAME=value` when the server's global environment sets it, else exit 1.
 */
function showEnvironment(configDir?: string): string {
  const answer = configDir ? `echo 'CLAUDE_CONFIG_DIR=${configDir}'; exit 0` : `echo "unknown variable: CLAUDE_CONFIG_DIR" >&2; exit 1`;
  return `if [ "$1" = show-environment ]; then [ "$2 $3" = "-g CLAUDE_CONFIG_DIR" ] || exit 1; ${answer}; fi\n`;
}

/** A tmux server that only answers `show-environment`, in `dir/bin`; its path. */
function fakeTmux(dir: string, configDir?: string): { bin: string; tmux: string } {
  const bin = join(dir, 'bin');
  mkdirSync(bin, { recursive: true });
  const tmux = join(bin, 'tmux');
  writeFileSync(tmux, `#!/bin/sh\n${showEnvironment(configDir)}exit 1\n`, { mode: 0o755 });
  return { bin, tmux };
}

/** A Claude Code folder with its own login and account, as `CLAUDE_CONFIG_DIR` points to. */
function fakeConfigDir(dir: string, name: string) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '.credentials.json'), JSON.stringify({ claudeAiOauth: cred(name) }), { mode: 0o600 });
  writeFileSync(join(dir, '.claude.json'), JSON.stringify({ numStartups: 2, oauthAccount: oauthAccount(name) }, null, 2));
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

test("a machine whose tmux sets CLAUDE_CONFIG_DIR is read from that folder, not the default one", withDir(async (dir) => {
  if (process.platform !== 'linux') return;
  fakeHome(dir);
  const folder = join(dir, '.claude-twb');
  fakeConfigDir(folder, 'two');
  const { bin, tmux } = fakeTmux(dir, folder);
  const snap = await inspectHost(fakeExec(dir, bin, tmux));
  assert.equal(snap.cred?.refreshToken, 'rt-two');
  assert.deepEqual(snap.oauthAccount, oauthAccount('two'));
}));

test('a switch of that machine writes its folder and leaves the default one as it was', withDir(async (dir) => {
  if (process.platform !== 'linux') return;
  fakeHome(dir);
  const folder = join(dir, '.claude-twb');
  fakeConfigDir(folder, 'two');
  const { bin, tmux } = fakeTmux(dir, folder);
  const credsBefore = readFileSync(join(dir, '.claude', '.credentials.json'), 'utf8');
  const confBefore = readFileSync(join(dir, '.claude.json'), 'utf8');
  // A refresh of the default folder's Claude Code (another one: the bot) does not hold this switch up.
  mkdirSync(join(dir, '.claude', '.oauth_refresh.lock'));
  const { snap, written } = await switchHost(fakeExec(dir, bin, tmux), () => ({ cred: cred('three'), oauthAccount: oauthAccount('three') }));
  assert.equal(written, true);
  assert.equal(snap.cred?.refreshToken, 'rt-two');
  assert.equal(JSON.parse(readFileSync(join(folder, '.credentials.json'), 'utf8')).claudeAiOauth.refreshToken, 'rt-three');
  const config = JSON.parse(readFileSync(join(folder, '.claude.json'), 'utf8'));
  assert.deepEqual(config.oauthAccount, oauthAccount('three'));
  assert.equal(config.numStartups, 2);
  assert.equal(readFileSync(join(dir, '.claude', '.credentials.json'), 'utf8'), credsBefore);
  assert.equal(readFileSync(join(dir, '.claude.json'), 'utf8'), confBefore);
  for (const lock of ['.claude-twb/.oauth_refresh.lock', '.claude-twb.lock', '.claude-twb/.claude.json.lock', '.claude.lock', '.claude.json.lock']) assert.equal(existsSync(join(dir, lock)), false, lock);
}));

const SERVICE = 'Claude Code-credentials';

/** A time long before any test runs, to tell whether a switch touched a file. */
const PAST = new Date('2020-01-01T00:00:00Z');

/** The Keychain item Claude Code uses with `CLAUDE_CONFIG_DIR` set to `folder`. */
function folderService(folder: string): string {
  return `${SERVICE}-${createHash('sha256').update(folder).digest('hex').slice(0, 8)}`;
}

/**
 * A made-up macOS in `dir/bin`: uname says Darwin, and `security` keeps one password per
 * Keychain item, in ~/kc for `Claude Code-credentials` and in ~/kc<rest of the name> for
 * another item (`Claude Code-credentials-<hash>` is ~/kc-<hash>); ~/kc holds account s
 * "pro", with an MCP server's token (`mcp` long if asked). It leaves what `security -i`
 * gets in ~/kc.in, and the arguments of a direct `add-generic-password` (a login too long
 * for `-i`) in ~/kc.args. Like the login Keychain, it answers only inside the graphical
 * session (TWB_GUI, set by the fake tmux server's `run-shell`), except with
 * `keychain: 'ssh'`, where it answers anyone. With `keychain: 'none'` there is no tmux
 * server either. The fake tmux logs its arguments in ~/tmux.log, sets `CLAUDE_CONFIG_DIR`
 * in its global environment when `configDir` is given, and expands formats in
 * `run-shell`'s command as tmux does (`##` is `#`, `#{…}` and `#<letter>` are replaced).
 */
function fakeMac(dir: string, keychain: 'ssh' | 'tmux' | 'none', opts: { refuseWrite?: boolean; homeName?: string; mcp?: string; configDir?: string } = {}) {
  const home = join(dir, opts.homeName ?? 'home');
  const bin = join(dir, 'bin');
  mkdirSync(home);
  mkdirSync(bin);
  fakeHome(home);
  writeFileSync(join(home, 'kc'), JSON.stringify({ claudeAiOauth: cred('pro'), mcpOAuth: { srv: { token: opts.mcp ?? 'k' } } }));
  writeFileSync(join(bin, 'uname'), '#!/bin/sh\necho Darwin\n', { mode: 0o755 });
  const gate = keychain === 'ssh' ? '' : '[ -n "$TWB_GUI" ] || { echo "security: User interaction is not allowed." >&2; exit 36; }\n';
  const write = opts.refuseWrite ? 'exit 45' : 'cat > "$HOME/kc.in"';
  const writeArgs = opts.refuseWrite ? 'exit 45' : 'shift; printf "%s\\n" "$@" > "$HOME/kc.args"';
  const item = `svc=""; prev=""; for a in "$@"; do [ "$prev" = -s ] && svc=$a; prev=$a; done; f="$HOME/kc\${svc#${SERVICE}}"\n`;
  const find = `[ -f "$f" ] || { echo "security: The specified item could not be found in the keychain." >&2; exit 44; }; cat "$f"`;
  writeFileSync(join(bin, 'security'), `#!/bin/sh\n${gate}${item}case "$1" in find-generic-password) ${find};; -i) ${write};; add-generic-password) ${writeArgs};; *) exit 1;; esac\n`, { mode: 0o755 });
  const tmux = join(bin, 'tmux');
  const expand = `sed -e 's/##/@HASH@/g' -e 's/#{[^}]*}/X/g' -e 's/#[A-Za-z]/X/g' -e 's/@HASH@/#/g'`;
  writeFileSync(
    tmux,
    keychain === 'none'
      ? '#!/bin/sh\necho "no server running on /private/tmp/tmux-501/default" >&2\nexit 1\n'
      : `#!/bin/sh\nprintf "%s\\n" "$*" >> "$HOME/tmux.log"\n${showEnvironment(opts.configDir)}[ "$1" = run-shell ] || exit 1\nTWB_GUI=1 exec /bin/sh -c "$(printf %s "$2" | ${expand})"\n`,
    { mode: 0o755 },
  );
  return { home, exec: fakeExec(home, bin, tmux) };
}

type KeychainDoc = { claudeAiOauth: OAuthCred; mcpOAuth?: unknown };

/** What the switch wrote into the fake Keychain item `service`, decoded: through `security -i`, or as arguments when too long. */
function keychainWrite(home: string, service = SERVICE): KeychainDoc {
  if (existsSync(join(home, 'kc.args'))) {
    const args = readFileSync(join(home, 'kc.args'), 'utf8').split('\n');
    assert.deepEqual(args.slice(0, 5), ['-U', '-a', 'tester', '-s', service]);
    assert.equal(args[5], '-X');
    return JSON.parse(Buffer.from(args[6], 'hex').toString('utf8'));
  }
  const cmd = readFileSync(join(home, 'kc.in'), 'utf8');
  const hex = new RegExp(`-s "${service}" -X "([0-9a-f]+)"`).exec(cmd)?.[1];
  assert.ok(cmd.startsWith('add-generic-password -U -a "tester"') && hex, cmd);
  return JSON.parse(Buffer.from(hex, 'hex').toString('utf8'));
}

test('a Mac whose Keychain answers no one (no tmux server) is read and switched through the file', withDir(async (dir) => {
  if (process.platform !== 'linux') return;
  const { home, exec } = fakeMac(dir, 'none');
  const snap = await inspectHost(exec);
  assert.equal(snap.os, 'Darwin');
  assert.equal(snap.store, 'file');
  assert.equal(snap.cred?.refreshToken, 'rt-max');
  const { written } = await switchHost(exec, () => ({ cred: cred('team'), oauthAccount: oauthAccount('team') }));
  assert.equal(written, true);
  const creds = JSON.parse(readFileSync(join(home, '.claude', '.credentials.json'), 'utf8'));
  assert.equal(creds.claudeAiOauth.refreshToken, 'rt-team');
  assert.deepEqual(creds.mcpOAuth, { srv: { token: 't' } });
  assert.equal(existsSync(join(home, 'kc.in')), false);
}));

test('a Mac whose Keychain only answers through its tmux server is read from the Keychain', withDir(async (dir) => {
  if (process.platform !== 'linux') return;
  const { home, exec } = fakeMac(dir, 'tmux');
  const snap = await inspectHost(exec);
  assert.equal(snap.store, 'keychain');
  assert.equal(snap.via, 'tmux');
  // The Keychain's login (the one its Claude Codes use), not the file's.
  assert.equal(snap.cred?.refreshToken, 'rt-pro');
  assert.deepEqual(readdirSync(join(home, '.claude')).filter((f) => f.startsWith('.twb')), []);
}));

test('a switch of a Mac whose Keychain only answers through tmux writes the Keychain through it, with no secret on its command line', withDir(async (dir) => {
  if (process.platform !== 'linux') return;
  const { home, exec } = fakeMac(dir, 'tmux');
  const { snap, written } = await switchHost(exec, () => ({ cred: cred('team'), oauthAccount: oauthAccount('team') }));
  assert.equal(written, true);
  assert.equal(snap.cred?.refreshToken, 'rt-pro');
  assert.equal(keychainWrite(home).claudeAiOauth.refreshToken, 'rt-team');
  const log = readFileSync(join(home, 'tmux.log'), 'utf8');
  assert.match(log, /^run-shell /m);
  assert.doesNotMatch(log, /rt-team|at-team|rt-pro|[0-9a-f]{64}/);
  assert.deepEqual(readdirSync(join(home, '.claude')).filter((f) => f.startsWith('.twb')), []);
}));

for (const via of ['ssh', 'tmux'] as const) {
  test(`a Mac whose Keychain answers (${via}) is switched in the Keychain only, which keeps its other entries, and its file gets a new time`, withDir(async (dir) => {
    if (process.platform !== 'linux') return;
    const { home, exec } = fakeMac(dir, via);
    const file = join(home, '.claude', '.credentials.json');
    const fileBefore = readFileSync(file, 'utf8');
    utimesSync(file, PAST, PAST);
    const { snap, written } = await switchHost(exec, () => ({ cred: cred('team'), oauthAccount: oauthAccount('team') }));
    assert.equal(written, true);
    assert.equal(snap.store, 'keychain');
    assert.equal(snap.cred?.refreshToken, 'rt-pro');
    const kc = keychainWrite(home);
    assert.equal(kc.claudeAiOauth.refreshToken, 'rt-team');
    assert.deepEqual(kc.mcpOAuth, { srv: { token: 'k' } });
    // A second copy of a refresh token that works once would end the Keychain's session.
    assert.equal(readFileSync(file, 'utf8'), fileBefore);
    // Its new time is what makes the Claude Codes already running read the Keychain again.
    assert.ok(statSync(file).mtimeMs > PAST.getTime());
    assert.deepEqual(JSON.parse(readFileSync(join(home, '.claude.json'), 'utf8')).oauthAccount, oauthAccount('team'));
  }));
}

test('a Keychain login too long for `security -i` is written through tmux as an argument, never on its command line', withDir(async (dir) => {
  if (process.platform !== 'linux') return;
  const { home, exec } = fakeMac(dir, 'tmux', { mcp: 'm'.repeat(3000) });
  const { written } = await switchHost(exec, () => ({ cred: cred('team'), oauthAccount: oauthAccount('team') }));
  assert.equal(written, true);
  assert.equal(existsSync(join(home, 'kc.in')), false);
  const kc = keychainWrite(home);
  assert.equal(kc.claudeAiOauth.refreshToken, 'rt-team');
  assert.deepEqual(kc.mcpOAuth, { srv: { token: 'm'.repeat(3000) } });
  assert.doesNotMatch(readFileSync(join(home, 'tmux.log'), 'utf8'), /rt-team|at-team|[0-9a-f]{64}/);
  assert.deepEqual(readdirSync(join(home, '.claude')).filter((f) => f.startsWith('.twb')), []);
}));

test('a Mac whose home has a # in its path still reaches its Keychain through tmux', withDir(async (dir) => {
  if (process.platform !== 'linux') return;
  const { home, exec } = fakeMac(dir, 'tmux', { homeName: 'x#Hy' });
  const snap = await inspectHost(exec);
  assert.equal(snap.store, 'keychain');
  assert.equal(snap.cred?.refreshToken, 'rt-pro');
  await switchHost(exec, () => ({ cred: cred('team'), oauthAccount: oauthAccount('team') }));
  assert.equal(keychainWrite(home).claudeAiOauth.refreshToken, 'rt-team');
}));

test('a Mac with no credentials file is switched in the Keychain and still has no file', withDir(async (dir) => {
  if (process.platform !== 'linux') return;
  const { home, exec } = fakeMac(dir, 'tmux');
  rmSync(join(home, '.claude', '.credentials.json'));
  const { written } = await switchHost(exec, () => ({ cred: cred('team'), oauthAccount: oauthAccount('team') }));
  assert.equal(written, true);
  assert.equal(keychainWrite(home).claudeAiOauth.refreshToken, 'rt-team');
  assert.equal(existsSync(join(home, '.claude', '.credentials.json')), false);
}));

test('a Mac whose Keychain refuses the write is left as it was', withDir(async (dir) => {
  if (process.platform !== 'linux') return;
  const { home, exec } = fakeMac(dir, 'tmux', { refuseWrite: true });
  const file = join(home, '.claude', '.credentials.json');
  const fileBefore = readFileSync(file, 'utf8');
  utimesSync(file, PAST, PAST);
  const confBefore = readFileSync(join(home, '.claude.json'), 'utf8');
  await assert.rejects(switchHost(exec, () => ({ cred: cred('team'), oauthAccount: oauthAccount('team') })), /no se pudo escribir en el Llavero del Mac/);
  assert.equal(readFileSync(file, 'utf8'), fileBefore);
  assert.equal(statSync(file).mtimeMs, PAST.getTime());
  assert.equal(readFileSync(join(home, '.claude.json'), 'utf8'), confBefore);
  assert.equal(JSON.parse(readFileSync(join(home, 'kc'), 'utf8')).claudeAiOauth.refreshToken, 'rt-pro');
}));

test("a Mac whose tmux sets CLAUDE_CONFIG_DIR is read and switched in that folder's Keychain item", withDir(async (dir) => {
  if (process.platform !== 'linux') return;
  const folder = join(dir, 'home', '.claude-twb');
  const { home, exec } = fakeMac(dir, 'tmux', { configDir: folder });
  fakeConfigDir(folder, 'two');
  const service = folderService(folder);
  writeFileSync(join(home, `kc${service.slice(SERVICE.length)}`), JSON.stringify({ claudeAiOauth: cred('kc-two') }));
  const confBefore = readFileSync(join(home, '.claude.json'), 'utf8');
  const folderCreds = join(folder, '.credentials.json');
  const folderCredsBefore = readFileSync(folderCreds, 'utf8');
  utimesSync(folderCreds, PAST, PAST);
  const snap = await inspectHost(exec);
  assert.equal(snap.store, 'keychain');
  assert.equal(snap.cred?.refreshToken, 'rt-kc-two');
  const { written } = await switchHost(exec, () => ({ cred: cred('three'), oauthAccount: oauthAccount('three') }));
  assert.equal(written, true);
  assert.equal(keychainWrite(home, service).claudeAiOauth.refreshToken, 'rt-three');
  assert.equal(readFileSync(folderCreds, 'utf8'), folderCredsBefore);
  assert.ok(statSync(folderCreds).mtimeMs > PAST.getTime());
  assert.deepEqual(JSON.parse(readFileSync(join(folder, '.claude.json'), 'utf8')).oauthAccount, oauthAccount('three'));
  assert.equal(readFileSync(join(home, '.claude.json'), 'utf8'), confBefore);
}));

// ---------------------------------------------------------------- the hub's side (AccountManager)

/**
 * Anthropic's profile and usage endpoints, answered by access token (`at-<name>`, or a
 * renewed `at-<name>-<n>`, is of account `<name>`), with every request logged as
 * "<path> <token>". s1's week is spent. With `together`, profile answers wait until that
 * many profile questions are in flight (2 s at most), so they overlap.
 */
function fakeAnthropic(opts: { together?: number } = {}): { fetch: Fetch; calls: string[] } {
  const calls: string[] = [];
  const weekly: Record<string, number> = { s1: 100, s2: 2, s3: 50 };
  const held: (() => void)[] = [];
  const answer: Fetch = async (input, init) => {
    const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
    const token = (new Headers(init?.headers).get('Authorization') ?? '').replace('Bearer ', '');
    calls.push(`${path} ${token}`);
    const who = /^at-(s\d)(-\w+)?$/.exec(token)?.[1];
    if (!who) return new Response('{}', { status: 401 });
    if (path === '/api/oauth/profile') {
      if (opts.together) {
        await new Promise<void>((go) => {
          held.push(go);
          setTimeout(go, 2000);
          if (held.length >= opts.together!) for (const g of held.splice(0)) g();
        });
      }
      return Response.json({ account: { uuid: `acc-${who}`, email: `${who}@example.com` }, organization: { uuid: `org-${who}`, name: who, organization_type: 'claude_max' } });
    }
    return Response.json({ five_hour: { utilization: 10, resets_at: '2026-11-19T16:40:00Z' }, seven_day: { utilization: weekly[who], resets_at: '2026-11-23T08:00:00Z' } });
  };
  return { fetch: answer, calls };
}

/** A Linux machine `id` whose files (in `dir/<id>`) hold `login`, for inspect and switch. */
function fakeMachine(dir: string, id: string, login: HostLogin): HostMonitor {
  const home = join(dir, id);
  mkdirSync(join(home, '.claude'), { recursive: true });
  writeFileSync(join(home, '.claude', '.credentials.json'), JSON.stringify({ claudeAiOauth: login.cred }));
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ oauthAccount: login.oauthAccount }));
  return { id, name: id, exec: fakeExec(home), snapshot: { status: 'ok' }, on: () => {} } as unknown as HostMonitor;
}

/** The store after the owner's Mac (files naming s1, login of s2) was switched away: s1 keeps a spare of s2. */
function withWrongSpare(store: AccountStore): void {
  store.observe('mac', mixed());
  store.observe('mac', { oauthAccount: null, cred: null });
}

test("a login of s2 filed under s1 moves to s2 before s1's usage is read, and s1 never shows s2's numbers", withDir(async (dir) => {
  const store = new AccountStore(dir);
  withWrongSpare(store);
  const api = fakeAnthropic();
  const manager = new AccountManager(store, new Map(), api.fetch);
  await manager.pollDue();
  assert.equal(api.calls[0], '/api/oauth/profile at-s2');
  assert.equal(store.get('acc-s1:org-s1')!.usage, undefined);
  assert.deepEqual(store.get('acc-s2:org-s2')!.logins.map((l) => l.cred.refreshToken), ['rt-s2']);
  await manager.pollDue();
  assert.equal(store.get('acc-s2:org-s2')!.usage?.sevenDay?.pct, 2);
  assert.equal(store.get('acc-s1:org-s1')!.usage, undefined);
}));

test('a confirmed login is not asked for its profile again, not even after a restart', withDir(async (dir) => {
  const store = new AccountStore(dir);
  withWrongSpare(store);
  await new AccountManager(store, new Map(), fakeAnthropic().fetch).pollDue();
  const again = fakeAnthropic();
  await new AccountManager(new AccountStore(dir), new Map(), again.fetch).pollDue();
  assert.deepEqual(again.calls, ['/api/oauth/usage at-s2']);
}));

test('a switch hands out only a login confirmed as the account: one of another account moves, and the next spare goes', withDir(async (dir) => {
  if (process.platform !== 'linux') return;
  const store = new AccountStore(dir);
  store.observe('ct', seen('s3'));
  // s1's own login, older, and a newer one of s2 filed under s1 (the freshest spare goes first).
  store.addLogin(oauthAccount('s1'), cred('s1'), {});
  await new Promise((r) => setTimeout(r, 5));
  withWrongSpare(store);
  const manager = new AccountManager(store, new Map([['ct', fakeMachine(dir, 'ct', seen('s3'))]]), fakeAnthropic().fetch);
  await manager.switchHost('ct', 'acc-s1:org-s1');
  assert.equal(JSON.parse(readFileSync(join(dir, 'ct', '.claude', '.credentials.json'), 'utf8')).claudeAiOauth.refreshToken, 'rt-s1');
  assert.equal(store.hostAccount('ct'), 'acc-s1:org-s1');
  assert.deepEqual(store.get('acc-s2:org-s2')!.logins.map((l) => l.cred.refreshToken), ['rt-s2']);
}));

test('a switch to an account whose only spare is of another one asks for a login and writes nothing', withDir(async (dir) => {
  if (process.platform !== 'linux') return;
  const store = new AccountStore(dir);
  store.observe('ct', seen('s3'));
  withWrongSpare(store);
  const manager = new AccountManager(store, new Map([['ct', fakeMachine(dir, 'ct', seen('s3'))]]), fakeAnthropic().fetch);
  await assert.rejects(manager.switchHost('ct', 'acc-s1:org-s1'), NeedsLoginError);
  assert.equal(JSON.parse(readFileSync(join(dir, 'ct', '.claude', '.credentials.json'), 'utf8')).claudeAiOauth.refreshToken, 'rt-s3');
  assert.deepEqual(store.get('acc-s2:org-s2')!.logins.map((l) => l.cred.refreshToken), ['rt-s2']);
}));

test("a machine whose files disagree is shown on its login's account, once its token can be asked", withDir(async (dir) => {
  if (process.platform !== 'linux') return;
  const store = new AccountStore(dir);
  const hosts = new Map([['mac', fakeMachine(dir, 'mac', { oauthAccount: oauthAccount('s1'), cred: cred('s2', -60_000) })]]);
  const api = fakeAnthropic();
  const manager = new AccountManager(store, hosts, api.fetch);
  await manager.inspect('mac', true);
  await manager.pollDue();
  // Only the machine renews its login: until it does, the hub neither asks nor reads with it.
  assert.deepEqual(api.calls, []);
  hosts.set('mac', fakeMachine(join(dir, 'later'), 'mac', mixed()));
  await manager.inspect('mac', true);
  assert.deepEqual(api.calls, ['/api/oauth/profile at-s2']);
  assert.equal(store.hostAccount('mac'), 'acc-s2:org-s2');
}));

test('a moved machine login renewed by its machine is confirmed again on its account with one profile question', withDir(async (dir) => {
  if (process.platform !== 'linux') return;
  const store = new AccountStore(dir);
  const hosts = new Map([['mac', fakeMachine(dir, 'mac', mixed())]]);
  const api = fakeAnthropic();
  const manager = new AccountManager(store, hosts, api.fetch);
  await manager.inspect('mac', true);
  hosts.set('mac', fakeMachine(join(dir, 'later'), 'mac', { oauthAccount: oauthAccount('s1'), cred: { ...cred('s2'), accessToken: 'at-s2-b', refreshToken: 'rt-s2-b' } }));
  await manager.inspect('mac', true);
  assert.deepEqual(api.calls, ['/api/oauth/profile at-s2', '/api/oauth/profile at-s2-b']);
  assert.equal(store.hostAccount('mac'), 'acc-s2:org-s2');
  assert.deepEqual(store.get('acc-s2:org-s2')!.logins.map((l) => [l.cred.refreshToken, l.confirmed]), [['rt-s2-b', true]]);
}));

test("a switch to the account a machine's ~/.claude.json names writes the login when the machine's own is of another account", withDir(async (dir) => {
  if (process.platform !== 'linux') return;
  const store = new AccountStore(dir);
  // The owner's MacBook Pro after the deploy: its file names s2, its login is s1's.
  const machine: HostLogin = { oauthAccount: oauthAccount('s2'), cred: cred('s1') };
  store.observe('mac', machine);
  store.moveLogin(store.get('acc-s2:org-s2')!.logins[0].id, oauthAccount('s1'));
  store.addLogin(oauthAccount('s2'), { ...cred('s2'), accessToken: 'at-s2-p', refreshToken: 'rt-s2-p' }, {});
  const manager = new AccountManager(store, new Map([['mac', fakeMachine(dir, 'mac', machine)]]), fakeAnthropic().fetch);
  await manager.switchHost('mac', 'acc-s2:org-s2');
  assert.equal(JSON.parse(readFileSync(join(dir, 'mac', '.claude', '.credentials.json'), 'utf8')).claudeAiOauth.refreshToken, 'rt-s2-p');
  assert.equal(store.hostAccount('mac'), 'acc-s2:org-s2');
  assert.equal(store.spareLogin('acc-s1:org-s1').cred.refreshToken, 'rt-s1');
}));

test('two rounds that confirm the same login at once move it once and log one move', withDir(async (dir) => {
  if (process.platform !== 'linux') return;
  const store = new AccountStore(dir);
  withWrongSpare(store);
  const logged = mock.method(console, 'log', () => {});
  try {
    const manager = new AccountManager(store, new Map([['ct', fakeMachine(dir, 'ct', seen('s3'))]]), fakeAnthropic({ together: 2 }).fetch);
    await Promise.allSettled([manager.pollDue(), manager.switchHost('ct', 'acc-s1:org-s1')]);
  } finally {
    logged.mock.restore();
  }
  const moves = logged.mock.calls.map((c) => String(c.arguments[0])).filter((line) => line.includes('movido'));
  assert.deepEqual(moves, ['[cuentas] el login que estaba en s1 es de s2: movido']);
  assert.deepEqual(store.get('acc-s2:org-s2')!.logins.map((l) => [l.cred.refreshToken, l.confirmed]), [['rt-s2', true]]);
}));
