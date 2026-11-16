import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import type { BranchList } from '../../shared/types.js';
import { branchNameProblem, pickBase, worktreeNameProblem } from '../../shared/worktree.js';
import { shQuote } from './exec.js';
import { branchesScript, parseBranches, parsePrepare, prelude, prepareScript, type Prepared } from './worktree-base.js';

// ---------------------------------------------------------------- fixtures

// The environment drops every inherited GIT_* variable: a GIT_DIR from a git hook would
// otherwise point these commands at the real repository.
const env = (home: string, extra: Record<string, string> = {}) => ({ PATH: process.env.PATH, HOME: home, ...extra });

const git = (home: string, cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, ...args], { env: env(home), stdio: 'pipe' }).toString().trim();

const sh = (script: string, home: string, extra: Record<string, string> = {}) =>
  new Promise<string>((resolve, reject) => execFile('/bin/sh', ['-c', script], { env: env(home, extra) }, (err, out) => (err ? reject(err) : resolve(out))));

const write = (path: string, text: string) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};

/**
 * A bare origin with master, release/2.0 (one commit ahead) and feature/login, and a clone
 * of it at home/repo, as a machine has it.
 */
function fixture(home: string): { bare: string; repo: string } {
  write(join(home, '.gitconfig'), '[user]\n\tname = t\n\temail = t@example.org\n[init]\n\tdefaultBranch = master\n');
  const seed = join(home, 'seed');
  mkdirSync(seed);
  git(home, seed, 'init', '-q');
  writeFileSync(join(seed, 'a'), '1');
  git(home, seed, 'add', 'a');
  git(home, seed, 'commit', '-qm', 'one');
  git(home, seed, 'checkout', '-qb', 'release/2.0');
  writeFileSync(join(seed, 'a'), '2');
  git(home, seed, 'commit', '-qam', 'release');
  git(home, seed, 'checkout', '-q', 'master');
  git(home, seed, 'branch', 'feature/login');
  const bare = join(home, 'origin.git');
  execFileSync('git', ['clone', '-q', '--bare', seed, bare], { env: env(home), stdio: 'pipe' });
  const repo = join(home, 'repo');
  execFileSync('git', ['clone', '-q', bare, repo], { env: env(home), stdio: 'pipe' });
  mkdirSync(join(repo, 'sub'));
  return { bare, repo };
}

async function withHome(fn: (home: string) => Promise<void>): Promise<void> {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'twb-base-')));
  try {
    await fn(home);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

const KOALARNES = JSON.stringify({ git: { baseBranch: 'release/2.0', hotfixBaseBranch: 'master' }, layers: [] }, null, 2);
const HOOK_SETTINGS = JSON.stringify({ hooks: { WorktreeCreate: [{ hooks: [{ type: 'command', command: 'ka hook worktree-create' }] }] } }, null, 2);

/** The machine's tmux for the scripts: none (a command that fails), so no test reaches a real tmux server. */
const NO_TMUX = 'false';

const branches = (home: string, path: string, extra: Record<string, string> = {}, tmux = NO_TMUX) =>
  sh(branchesScript(path, tmux), home, extra).then(parseBranches);
const prepare = (home: string, path: string, worktree: string, base: string, extra: Record<string, string> = {}, tmux = NO_TMUX): Promise<Prepared> =>
  sh(prepareScript(path, worktree, base, tmux), home, extra).then((out) => parsePrepare(out, worktree, base));
const sha = (home: string, repo: string, ref: string) => git(home, repo, 'rev-parse', ref);

// ---------------------------------------------------------------- names and the branch offered first

test('a base branch name is checked as git would before it reaches a machine', () => {
  for (const ok of ['master', 'release/2.0', 'feature/14-login', 'v1.2_fix', 'a@b']) assert.equal(branchNameProblem(ok), null, ok);
  assert.match(branchNameProblem('') ?? '', /Falta la rama base/);
  for (const bad of ['-x', 'a..b', 'a b', 'a\tb', 'a\nb', 'x@{1}', 'a/', '/a', 'a//b', 'a.lock', 'a/.b', 'a.', '@', 'a~1', 'a^', 'a:b', 'a?', 'a*', 'a[b', 'a\\b', 'HEAD', 'x'.repeat(201)]) {
    assert.match(branchNameProblem(bad) ?? '', /no es un nombre de rama válido/, JSON.stringify(bad));
  }
});

test('the branch offered first: the remembered one while origin has it, else the project base, else the first', () => {
  const list: BranchList = { repo: true, branches: ['develop', 'master', 'release/2.0'], base: 'develop' };
  assert.equal(pickBase('release/2.0', list), 'release/2.0');
  assert.equal(pickBase('release/1.9', list), 'develop');
  assert.equal(pickBase(undefined, list), 'develop');
  assert.equal(pickBase(undefined, { repo: true, branches: ['b', 'c'] }), 'b');
  assert.equal(pickBase('x', { repo: true, branches: [] }), undefined);
  assert.equal(pickBase('x', { repo: false }), undefined);
});

// ---------------------------------------------------------------- the branch list

test('the branches of origin after a fetch, with the remote default as the base, from any subfolder', () =>
  withHome(async (home) => {
    const { bare, repo } = fixture(home);
    git(home, bare, 'branch', 'hotfix/urgente', 'master');
    assert.deepEqual(await branches(home, join(repo, 'sub')), { repo: true, branches: ['feature/login', 'hotfix/urgente', 'master', 'release/2.0'], base: 'master' });
  }));

test("koalarnes.json's git.baseBranch is the base while origin has it", () =>
  withHome(async (home) => {
    const { repo } = fixture(home);
    const base = async () => {
      const list = await branches(home, repo);
      return list.repo ? list.base : undefined;
    };
    write(join(repo, '.claude/koalarnes.json'), KOALARNES);
    assert.equal(await base(), 'release/2.0');
    write(join(repo, '.claude/koalarnes.json'), JSON.stringify({ git: { baseBranch: 'develop' } }));
    assert.equal(await base(), 'master');
    write(join(repo, '.claude/koalarnes.json'), '{ "layers": [] }');
    assert.equal(await base(), 'master');
  }));

test('an origin that does not answer: the branches the machine knows, and why they are not fresh', () =>
  withHome(async (home) => {
    const { repo } = fixture(home);
    git(home, repo, 'remote', 'set-url', 'origin', join(home, 'no-esta.git'));
    const list = await branches(home, repo);
    assert.ok(list.repo);
    assert.deepEqual(list.branches, ['feature/login', 'master', 'release/2.0']);
    assert.match(list.fetchError ?? '', /no-esta\.git/);
    git(home, repo, 'remote', 'remove', 'origin');
    assert.deepEqual(await branches(home, repo), { repo: true, branches: [], fetchError: 'El repositorio no tiene remoto origin' });
  }));

/** A unix socket at `path`, standing for an SSH agent. */
const socketAt = (path: string) => new Promise<Server>((resolve) => { const s = createServer(); s.listen(path, () => resolve(s)); });
const close = (s: Server) => new Promise<void>((resolve) => s.close(() => resolve()));

/**
 * The machine as the hub reaches it over ssh, for the fetch's agent: origin over ssh to a
 * fake `ssh` that writes down the SSH_AUTH_SOCK it got and is refused; a fake `ssh-add`
 * that answers «has keys» only for `keys`; and a fake tmux whose server has `global` as
 * SSH_AUTH_SOCK and whose one session ($1) has `session`.
 */
function agents(home: string, repo: string, keys: string, global: string, session: string): { extra: Record<string, string>; tmux: string; seen: () => string } {
  const bin = join(home, 'bin');
  const seen = join(home, 'seen');
  const script = (name: string, body: string) => {
    write(join(bin, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  };
  script('ssh', `printf '%s' "\${SSH_AUTH_SOCK:-}" > ${shQuote(seen)}; echo 'Permission denied (publickey).' >&2; exit 255`);
  script('ssh-add', `[ "$1" = -l ] && [ "\${SSH_AUTH_SOCK:-}" = ${shQuote(keys)} ] && exit 0; exit 2`);
  script(
    'tmux',
    `case "$*" in ` +
      `'show-environment -g SSH_AUTH_SOCK') echo SSH_AUTH_SOCK=${shQuote(global)} ;; ` +
      `'list-sessions -F #{session_id}') echo '$1' ;; ` +
      `'show-environment -t $1 SSH_AUTH_SOCK') echo SSH_AUTH_SOCK=${shQuote(session)} ;; ` +
      `*) exit 1 ;; esac`,
  );
  git(home, repo, 'remote', 'set-url', 'origin', 'ssh://git.example.invalid/repo.git');
  return { extra: { PATH: `${bin}:${process.env.PATH}`, GIT_SSH_COMMAND: join(bin, 'ssh') }, tmux: shQuote(join(bin, 'tmux')), seen: () => readFileSync(seen, 'utf8') };
}

test("without an agent with keys, the fetch takes the first one of the machine's tmux that has them", () =>
  withHome(async (home) => {
    const { repo } = fixture(home);
    const empty = await socketAt(join(home, 'empty.sock'));
    const full = await socketAt(join(home, 'full.sock'));
    try {
      // The server's agent is a socket with no keys; the session's has them.
      const m = agents(home, repo, join(home, 'full.sock'), join(home, 'empty.sock'), join(home, 'full.sock'));
      const list = await branches(home, repo, m.extra, m.tmux);
      assert.equal(m.seen(), join(home, 'full.sock'));
      assert.ok(list.repo);
      assert.match(list.fetchError ?? '', /Permission denied/);
      await prepare(home, repo, 'wt', 'master', m.extra, m.tmux);
      assert.equal(m.seen(), join(home, 'full.sock'));
    } finally {
      await close(empty);
      await close(full);
    }
  }));

test('an agent of its own with keys is kept, and with no agent anywhere the fetch goes on without one', () =>
  withHome(async (home) => {
    const { repo } = fixture(home);
    const own = await socketAt(join(home, 'own.sock'));
    const full = await socketAt(join(home, 'full.sock'));
    try {
      const m = agents(home, repo, join(home, 'own.sock'), join(home, 'full.sock'), join(home, 'full.sock'));
      await branches(home, repo, { ...m.extra, SSH_AUTH_SOCK: join(home, 'own.sock') }, m.tmux);
      assert.equal(m.seen(), join(home, 'own.sock'));
      // No agent answers with keys, and a path that is no socket is never taken.
      const none = agents(home, repo, join(home, 'nadie.sock'), join(home, 'no-es-un-socket'), join(home, 'full.sock'));
      await branches(home, repo, none.extra, none.tmux);
      assert.equal(none.seen(), '');
    } finally {
      await close(own);
      await close(full);
    }
  }));

test('a folder outside git has no branches', () =>
  withHome(async (home) => {
    mkdirSync(join(home, 'suelta'));
    assert.deepEqual(await branches(home, join(home, 'suelta')), { repo: false });
    assert.deepEqual(await branches(home, join(home, 'no-existe')), { repo: false });
  }));

// ---------------------------------------------------------------- preparing the worktree

test('a base origin does not have, even one the clone still knows, or a folder outside git, launches nothing', () =>
  withHome(async (home) => {
    const { bare, repo } = fixture(home);
    await assert.rejects(prepare(home, repo, 'feature/14-login', 'no-existe'), /No existe la rama base «no-existe» en origin/);
    git(home, bare, 'branch', '-D', 'release/2.0');
    await assert.rejects(prepare(home, repo, 'feature/14-login', 'release/2.0'), /No existe la rama base «release\/2\.0» en origin/);
    mkdirSync(join(home, 'suelta'));
    await assert.rejects(prepare(home, join(home, 'suelta'), 'feature/14-login', 'master'), /no está en un repositorio git/);
    await assert.rejects(prepare(home, join(home, 'suelta'), 'feature/14-login', ''), /no está en un repositorio git/);
    assert.throws(() => git(home, repo, 'rev-parse', '--verify', 'refs/heads/feature/14-login'));
  }));

test('an origin that cannot be reached: the worktree starts from the known origin/<base>, and says why', () =>
  withHome(async (home) => {
    const { repo } = fixture(home);
    git(home, repo, 'remote', 'set-url', 'origin', join(home, 'no-esta.git'));
    const made = await prepare(home, repo, 'feature/14-login', 'release/2.0');
    const path = join(repo, '.claude/worktrees/feature-14-login');
    assert.equal(made.kind, 'created');
    assert.equal(made.kind === 'created' && made.path, path);
    assert.match(made.stale ?? '', /no-esta\.git/);
    assert.equal(sha(home, path, 'HEAD'), sha(home, repo, 'refs/remotes/origin/release/2.0'));
    await assert.rejects(prepare(home, repo, 'feature/15-otra', 'no-existe'), /No se ha podido contactar con origin.*«no-existe»/);
  }));

/** The places a WorktreeCreate hook can be declared in: each puts one there and gives the extra environment it needs. */
const HOOK_PLACES: [string, (home: string, repo: string) => Record<string, string>][] = [
  ['the user settings', (home) => (write(join(home, '.claude/settings.json'), HOOK_SETTINGS), {})],
  ['the project settings', (_home, repo) => (write(join(repo, '.claude/settings.json'), HOOK_SETTINGS), {})],
  ['the local project settings', (_home, repo) => (write(join(repo, '.claude/settings.local.json'), HOOK_SETTINGS), {})],
  ['the settings of CLAUDE_CONFIG_DIR', (home) => (write(join(home, 'cfg/settings.json'), HOOK_SETTINGS), { CLAUDE_CONFIG_DIR: join(home, 'cfg') })],
  [
    'an enabled plugin',
    (home, repo) => {
      write(join(repo, '.claude/settings.json'), JSON.stringify({ enabledPlugins: { 'koalarnes@koalarnes': true } }, null, 2));
      write(join(home, '.claude/plugins/cache/koalarnes/koalarnes/0.8.1/hooks/hooks.json'), HOOK_SETTINGS);
      return {};
    },
  ],
];

for (const [place, put] of HOOK_PLACES) {
  test(`with a WorktreeCreate hook in ${place}, the worktree's branch is made from origin/<base> for the hook`, () =>
    withHome(async (home) => {
      const { repo } = fixture(home);
      const extra = put(home, repo);
      assert.deepEqual(await prepare(home, repo, 'feature/14-login', 'release/2.0', extra), { kind: 'hook' });
      assert.equal(sha(home, repo, 'refs/heads/feature/14-login'), sha(home, repo, 'refs/remotes/origin/release/2.0'));
      assert.throws(() => git(home, repo, 'rev-parse', '--abbrev-ref', 'feature/14-login@{upstream}'));
      assert.equal(git(home, repo, 'worktree', 'list', '--porcelain').split('\n').filter((l) => l.startsWith('worktree ')).length, 1);
    }));
}

test('a plugin with the hook that is not enabled is no hook: the hub makes the worktree', () =>
  withHome(async (home) => {
    const { repo } = fixture(home);
    write(join(home, '.claude/settings.json'), JSON.stringify({ enabledPlugins: { 'koalarnes@koalarnes': false } }));
    write(join(home, '.claude/plugins/cache/koalarnes/koalarnes/0.8.1/hooks/hooks.json'), HOOK_SETTINGS);
    assert.equal((await prepare(home, repo, 'feature/14-login', 'release/2.0')).kind, 'created');
  }));

test("with a hook, even the project's base is made into the branch; without a base the hook decides; an existing branch is left to it", () =>
  withHome(async (home) => {
    const { repo } = fixture(home);
    write(join(home, '.claude/settings.json'), HOOK_SETTINGS);
    write(join(repo, '.claude/koalarnes.json'), KOALARNES);
    assert.deepEqual(await prepare(home, repo, 'feature/14-login', 'release/2.0'), { kind: 'hook' });
    assert.equal(sha(home, repo, 'refs/heads/feature/14-login'), sha(home, repo, 'refs/remotes/origin/release/2.0'));
    assert.deepEqual(await prepare(home, repo, 'feature/15-otra', ''), { kind: 'native' });
    assert.throws(() => git(home, repo, 'rev-parse', '--verify', 'refs/heads/feature/15-otra'));
    git(home, repo, 'branch', 'feature/local', 'master');
    assert.deepEqual(await prepare(home, repo, 'feature/local', 'master'), { kind: 'reused', atBase: true });
    assert.deepEqual(await prepare(home, repo, 'feature/local', 'release/2.0'), { kind: 'reused' });
    assert.deepEqual(await prepare(home, repo, 'feature/login', 'release/2.0'), { kind: 'reused' });
    assert.throws(() => git(home, repo, 'rev-parse', '--verify', 'refs/heads/feature/login'));
  }));

test("without a hook, the hub always makes the worktree, named like it, from origin/<base> or else the project's base", () =>
  withHome(async (home) => {
    const { repo } = fixture(home);
    write(join(repo, '.claude/koalarnes.json'), KOALARNES);
    const made = await prepare(home, join(repo, 'sub'), 'feature/14-login', 'master');
    const path = join(repo, '.claude/worktrees/feature-14-login');
    assert.deepEqual(made, { kind: 'created', path });
    assert.equal(git(home, path, 'branch', '--show-current'), 'feature/14-login');
    assert.equal(sha(home, path, 'HEAD'), sha(home, repo, 'refs/remotes/origin/master'));
    assert.throws(() => git(home, repo, 'rev-parse', '--abbrev-ref', 'feature/14-login@{upstream}'));
    const other = join(repo, '.claude/worktrees/otro');
    assert.deepEqual(await prepare(home, repo, 'otro', ''), { kind: 'created', path: other });
    assert.equal(sha(home, other, 'HEAD'), sha(home, repo, 'refs/remotes/origin/release/2.0'));
    const exclude = readFileSync(join(repo, '.git/info/exclude'), 'utf8').split('\n');
    assert.equal(exclude.filter((l) => l === '.claude/worktrees/').length, 1);
    assert.equal(git(home, repo, 'status', '--porcelain', '--untracked-files=all').includes('worktrees'), false);
  }));

test('without a hook and without remote branches, the worktree starts from HEAD', () =>
  withHome(async (home) => {
    const { repo } = fixture(home);
    git(home, repo, 'remote', 'remove', 'origin');
    git(home, repo, 'checkout', '-qb', 'trabajo');
    git(home, repo, 'commit', '-q', '--allow-empty', '-m', 'local');
    const path = join(repo, '.claude/worktrees/feature-1-primera');
    assert.deepEqual(await prepare(home, repo, 'feature/1-primera', ''), { kind: 'created', path });
    assert.equal(sha(home, path, 'HEAD'), sha(home, repo, 'HEAD'));
  }));

test('without a hook, the new worktree gets the ignored files .worktreeinclude selects, and nothing else', () =>
  withHome(async (home) => {
    const { repo } = fixture(home);
    write(join(repo, '.gitignore'), '.env*\nsecret/\n');
    write(join(repo, '.worktreeinclude'), '.env*\nsecret/\nnotas.txt\n');
    write(join(repo, '.env'), 'A=1');
    write(join(repo, '.env.local'), 'B=2');
    write(join(repo, 'secret/clave'), 'k');
    write(join(repo, 'notas.txt'), 'no ignorado');
    const made = await prepare(home, repo, 'feature/14-login', 'master');
    const path = join(repo, '.claude/worktrees/feature-14-login');
    assert.deepEqual(made, { kind: 'created', path });
    assert.equal(readFileSync(join(path, '.env'), 'utf8'), 'A=1');
    assert.equal(readFileSync(join(path, '.env.local'), 'utf8'), 'B=2');
    assert.equal(readFileSync(join(path, 'secret/clave'), 'utf8'), 'k');
    assert.throws(() => readFileSync(join(path, 'notas.txt')));
  }));

test('without a hook, a target inside a linked worktree gets the new one under the main checkout', () =>
  withHome(async (home) => {
    const { repo } = fixture(home);
    const linked = join(repo, '.claude/worktrees/feature-a');
    git(home, repo, 'worktree', 'add', '-q', '-b', 'feature/a', linked, 'origin/master');
    assert.deepEqual(await prepare(home, linked, 'feature/b', 'master'), { kind: 'created', path: join(repo, '.claude/worktrees/feature-b') });
  }));

test('without a hook, an existing branch opens in its worktree, or a new one on it, and is refused when checked out elsewhere', () =>
  withHome(async (home) => {
    const { repo } = fixture(home);
    git(home, repo, 'branch', 'feature/local', 'master');
    const local = join(repo, '.claude/worktrees/feature-local');
    assert.deepEqual(await prepare(home, repo, 'feature/local', 'release/2.0'), { kind: 'reused', path: local });
    assert.equal(sha(home, local, 'HEAD'), sha(home, repo, 'refs/remotes/origin/master'));
    assert.deepEqual(await prepare(home, repo, 'feature/local', 'master'), { kind: 'reused', path: local, atBase: true });
    const remote = join(repo, '.claude/worktrees/feature-login');
    assert.deepEqual(await prepare(home, repo, 'feature/login', 'release/2.0'), { kind: 'reused', path: remote });
    assert.equal(git(home, remote, 'rev-parse', '--abbrev-ref', '@{upstream}'), 'origin/feature/login');
    await assert.rejects(prepare(home, repo, 'master', 'release/2.0'), new RegExp(`La rama master está extraída en ${repo}: elige otro nombre`));
    const away = join(home, 'fuera');
    git(home, repo, 'worktree', 'add', '-q', '-b', 'feature/fuera', away, 'origin/master');
    await assert.rejects(prepare(home, repo, 'feature/fuera', 'master'), new RegExp(`extraída en ${away}:`));
  }));

test('a worktree name that starts with a dash is refused, and git never reads one as an option', () =>
  withHome(async (home) => {
    assert.match(worktreeNameProblem('-m') ?? '', /no puede empezar por «-»/);
    assert.equal(worktreeNameProblem('feature/-x'), null);
    const { repo } = fixture(home);
    write(join(home, '.claude/settings.json'), HOOK_SETTINGS);
    await assert.rejects(prepare(home, repo, '-m', 'release/2.0'), /No se ha podido preparar el worktree/);
    assert.equal(git(home, repo, 'branch', '--show-current'), 'master');
  }));

test('without a hook, a worktree whose folder was deleted by hand is added again; others whose folder is missing stay', () =>
  withHome(async (home) => {
    const { repo } = fixture(home);
    const path = join(repo, '.claude/worktrees/feature-14-login');
    assert.deepEqual(await prepare(home, repo, 'feature/14-login', 'master'), { kind: 'created', path });
    // Another worktree on a drive that is not mounted now: git must not forget it.
    const away = join(home, 'disco/otro');
    git(home, repo, 'worktree', 'add', '-q', '-b', 'feature/otro', away, 'origin/master');
    renameSync(join(home, 'disco'), join(home, 'disco-fuera'));
    rmSync(path, { recursive: true, force: true });
    assert.deepEqual(await prepare(home, repo, 'feature/14-login', 'master'), { kind: 'reused', path, atBase: true });
    assert.equal(readFileSync(join(path, 'a'), 'utf8'), '1');
    assert.ok(git(home, repo, 'worktree', 'list', '--porcelain').split('\n').includes(`worktree ${away}`));
  }));

test('a branch named like the worktree that origin has and the clone has not fetched is reused, with a hook or without', () =>
  withHome(async (home) => {
    const { bare, repo } = fixture(home);
    git(home, bare, 'branch', 'feature/nueva', 'release/2.0');
    git(home, bare, 'branch', 'feature/otra', 'release/2.0');
    const path = join(repo, '.claude/worktrees/feature-nueva');
    assert.deepEqual(await prepare(home, repo, 'feature/nueva', 'master'), { kind: 'reused', path });
    assert.equal(sha(home, path, 'HEAD'), sha(home, bare, 'release/2.0'));
    write(join(home, '.claude/settings.json'), HOOK_SETTINGS);
    assert.deepEqual(await prepare(home, repo, 'feature/otra', 'master'), { kind: 'reused' });
    assert.equal(sha(home, repo, 'refs/remotes/origin/feature/otra'), sha(home, bare, 'release/2.0'));
    assert.throws(() => git(home, repo, 'rev-parse', '--verify', 'refs/heads/feature/otra'));
  }));

test('a branch that origin has and the clone cannot fetch fails the launch, with no new branch in its place', () =>
  withHome(async (home) => {
    const { bare, repo } = fixture(home);
    git(home, bare, 'branch', 'tema', 'master');
    git(home, repo, 'fetch', '-q', 'origin');
    git(home, bare, 'branch', '-D', 'tema');
    git(home, bare, 'branch', 'tema/x', 'release/2.0');
    await assert.rejects(prepare(home, repo, 'tema/x', 'master'), /origin tiene la rama tema\/x y no se ha podido traer/);
    assert.throws(() => git(home, repo, 'rev-parse', '--verify', 'refs/heads/tema/x'));
  }));

test('without a hook, a locked worktree whose folder was deleted by hand is added again', () =>
  withHome(async (home) => {
    const { repo } = fixture(home);
    const path = join(repo, '.claude/worktrees/feature-14-login');
    assert.deepEqual(await prepare(home, repo, 'feature/14-login', 'master'), { kind: 'created', path });
    git(home, repo, 'worktree', 'lock', path);
    rmSync(path, { recursive: true, force: true });
    assert.deepEqual(await prepare(home, repo, 'feature/14-login', 'master'), { kind: 'reused', path, atBase: true });
    assert.equal(readFileSync(join(path, 'a'), 'utf8'), '1');
  }));

test("a git failure says git's message", () =>
  withHome(async (home) => {
    const { repo } = fixture(home);
    write(join(repo, '.claude/worktrees/feature-x/ocupado'), 'x');
    await assert.rejects(prepare(home, repo, 'feature/x', 'master'), /No se ha podido preparar el worktree: .*already exists/);
  }));

test('a command that takes too long is killed, with the child that hangs on the network', async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'twb-bounded-')));
  try {
    git(home, home, 'init', '-q');
    // `sh` stands for git, and its `sleep` for the ssh it starts.
    const script = prelude(home, 'exit 9', NO_TMUX) + `bounded 1 sh -c 'sleep 30 & echo $! > child; wait'; echo "r=$?"`;
    assert.equal((await sh(script, home)).trim(), 'r=143');
    const child = Number(readFileSync(join(home, 'child'), 'utf8'));
    await new Promise((r) => setTimeout(r, 100));
    assert.throws(() => process.kill(child, 0), /ESRCH/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
