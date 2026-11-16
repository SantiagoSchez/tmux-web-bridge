import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findPaths, findPathsInRows } from '../../shared/paths.js';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GitChanges } from '../../shared/types.js';
import { findInReposScript, gitChanges, gitStat, parseRange, resolvePath, statHostFile, streamHostFile } from './files.js';
import type { HostMonitor } from './host.js';

const paths = (line: string) => findPaths(line).map((h) => (h.line ? `${h.path}:${h.line}` : h.path));

test('paths Claude Code prints become links, with their line', () => {
  assert.deepEqual(paths('● Update(server/src/tasks.ts)'), ['server/src/tasks.ts']);
  assert.deepEqual(paths('  ⎿  Read web/src/components/Dialogs.tsx (612 lines)'), ['web/src/components/Dialogs.tsx']);
  assert.deepEqual(paths('Mira `server/src/index.ts:42` y README.md.'), ['server/src/index.ts:42', 'README.md']);
  assert.deepEqual(paths('Guardé /tmp/captura.png y ~/notas/plan.md'), ['/tmp/captura.png', '~/notas/plan.md']);
  assert.deepEqual(paths('en ./scripts/test-kit-update.sh:10:3'), ['./scripts/test-kit-update.sh:10']);
  assert.deepEqual(paths('el binario /usr/local/bin/claude'), ['/usr/local/bin/claude']);
  assert.deepEqual(paths('Grabado en docs/videos/demo.mp4 y voz.m4a'), ['docs/videos/demo.mp4', 'voz.m4a']);
});

test('URLs, versions, numbers and loose words are not paths', () => {
  assert.deepEqual(paths('https://github.com/x/y/blob/main/README.md'), []);
  assert.deepEqual(paths('Claude Code 2.1.322 y v1.17.1, el 12/11, y/o e.g.'), []);
  assert.deepEqual(paths('server/src carpeta/ y //comentario'), []);
});

test('the start and end of a link are those of the path in the line', () => {
  const line = 'x (web/a.ts:7), y';
  const [hit] = findPaths(line);
  assert.equal(line.slice(hit.start, hit.end), 'web/a.ts:7');
});

test('relative paths go from the pane folder; absolute and ~/ ones stay', () => {
  assert.equal(resolvePath('src/a.ts:12', '/home/u/twb'), '/home/u/twb/src/a.ts');
  assert.equal(resolvePath('../b.md', '/home/u/twb'), '/home/u/b.md');
  assert.equal(resolvePath('/etc/hosts', '/x'), '/etc/hosts');
  assert.equal(resolvePath('~/n.md', '/x'), '~/n.md');
  assert.throws(() => resolvePath('a.ts', ''), /carpeta/);
});

test('a name the pane folders lack is found in their repo: the one changed last', async () => {
  if (process.platform !== 'linux') return;
  const dir = mkdtempSync(join(tmpdir(), 'twb-files-'));
  try {
    const git = (...args: string[]) => execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' });
    git('init', '-q');
    mkdirSync(join(dir, 'a', 'docs'), { recursive: true });
    mkdirSync(join(dir, 'b'), { recursive: true });
    mkdirSync(join(dir, 'node_modules', 'x'), { recursive: true });
    writeFileSync(join(dir, '.gitignore'), 'node_modules\n');
    writeFileSync(join(dir, 'a', 'docs', 'plan.md'), 'old');
    writeFileSync(join(dir, 'b', 'plan.md'), 'newer');
    writeFileSync(join(dir, 'node_modules', 'x', 'plan.md'), 'ignored, and newest');
    utimesSync(join(dir, 'a', 'docs', 'plan.md'), new Date(1e12), new Date(1e12));
    git('add', 'a');
    const host = {
      name: 'test',
      exec: {
        shell: (script: string) =>
          new Promise<string>((ok, ko) => execFile('/bin/sh', ['-c', script], { encoding: 'utf8' }, (e, out, err) => (e ? ko(new Error(err)) : ok(out)))),
      },
    } as unknown as HostMonitor;
    const stat = (raw: string, folder = join(dir, 'b')) => statHostFile(host, [resolvePath(raw, folder)], findInReposScript(raw, [folder]));

    // In the pane's folder: that one, without looking further.
    assert.deepEqual(await stat('plan.md', join(dir, 'a', 'docs')), { path: join(dir, 'a', 'docs', 'plan.md'), size: 3 });
    // Elsewhere in the repo: the one changed last (untracked too), never an ignored one.
    assert.deepEqual(await stat('plan.md', dir), { path: join(dir, 'b', 'plan.md'), size: 5 });
    assert.deepEqual(await stat('docs/plan.md:4', join(dir, 'b')), { path: join(dir, 'a', 'docs', 'plan.md'), size: 3 });
    await assert.rejects(stat('nada.md'), /No existe/);
    assert.equal(findInReposScript('../plan.md', [dir]), null);
    assert.equal(findInReposScript('/etc/hosts', [dir]), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a Range header asks for a piece of a file: from a byte, between two, or its last ones', () => {
  assert.deepEqual(parseRange('bytes=0-', 1000), { start: 0, length: 1000 });
  assert.deepEqual(parseRange('bytes=100-199', 1000), { start: 100, length: 100 });
  assert.deepEqual(parseRange('bytes=900-5000', 1000), { start: 900, length: 100 });
  assert.deepEqual(parseRange('bytes=-300', 1000), { start: 700, length: 300 });
  assert.deepEqual(parseRange('bytes=-5000', 1000), { start: 0, length: 1000 });
  // Past the end (or backwards): nothing to send.
  assert.equal(parseRange('bytes=1000-', 1000), 'unsatisfiable');
  assert.equal(parseRange('bytes=5-2', 1000), 'unsatisfiable');
  assert.equal(parseRange('bytes=-0', 1000), 'unsatisfiable');
  // None, several pieces or another unit: the whole file.
  assert.equal(parseRange(undefined, 1000), null);
  assert.equal(parseRange('bytes=0-1,5-9', 1000), null);
  assert.equal(parseRange('lines=0-1', 1000), null);
  assert.equal(parseRange('bytes=a-b', 1000), null);
});

test('a file is read whole, only its beginning, or only a piece of it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'twb-files-'));
  try {
    const path = join(dir, "it's a clip.mp4");
    writeFileSync(path, '0123456789');
    const host = { exec: { spawnShell: (script: string) => spawn('/bin/sh', ['-c', script]) } } as unknown as HostMonitor;
    const read = async (piece?: Parameters<typeof streamHostFile>[2]) => {
      const chunks: Buffer[] = [];
      for await (const c of streamHostFile(host, path, piece).stdout!) chunks.push(c as Buffer);
      return Buffer.concat(chunks).toString();
    };
    assert.equal(await read(), '0123456789');
    assert.equal(await read({ start: 0, length: 4 }), '0123');
    assert.equal(await read({ start: 3, length: 4 }), '3456');
    assert.equal(await read({ start: 7, length: 3 }), '789');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a path broken where its row ends is one link, on every row it takes', () => {
  const cols = 30;
  const rows = (...texts: string[]) => texts.map((text) => ({ text, full: text.trimEnd().length >= cols - 1 }));
  // Claude Code breaks it a column before the edge and indents the rest.
  const claude = rows('⏺ Lo dejé en web/src/componen', '  ts/TerminalView.tsx:42 ya.');
  for (const at of [0, 1]) {
    const [hit, ...more] = findPathsInRows(claude, at);
    assert.deepEqual(more, []);
    assert.equal(hit.path, 'web/src/components/TerminalView.tsx');
    assert.equal(hit.line, 42);
    assert.equal(hit.text, 'web/src/components/TerminalView.tsx:42');
    assert.deepEqual([hit.start, hit.last], [{ row: 0, i: 13 }, { row: 1, i: 23 }]);
  }
  // The terminal wraps an absolute one across three rows, with no indent.
  const shell = rows('cat /home/santiago/Dropbox/Doc', 'uments/Proyectos/tmux-web-brid', 'ge/README.md');
  assert.deepEqual(findPathsInRows(shell, 1).map((h) => h.path), ['/home/santiago/Dropbox/Documents/Proyectos/tmux-web-bridge/README.md']);
});

test('a path that ends at the edge, before an unrelated word, stays as it is', () => {
  const rows = [
    { text: 'Revisa también el README.md', full: true },
    { text: '  antes de seguir.', full: false },
  ];
  assert.deepEqual(findPathsInRows(rows, 0).map((h) => h.text), ['README.md']);
  assert.deepEqual(findPathsInRows(rows, 1), []);
  // A folder broken across rows is not a link, nor are its pieces that look like a path.
  const folder = [
    { text: '  /tmp/claude-1000/-home-santiago-Dropbox-Documents', full: true },
    { text: '  -Proyectos-agentic-ai-platform/9441b97c-6b99-48c6', full: true },
    { text: '  -90bf-5a9d99b2397d/scratchpad/migration/.', full: false },
  ];
  for (const at of [0, 1, 2]) assert.deepEqual(findPathsInRows(folder, at), []);
  // A short row does not go on in the next one.
  assert.deepEqual(findPathsInRows([{ text: 'ver a.ts', full: false }, { text: 'b.md', full: false }], 1).map((h) => h.text), ['b.md']);
});

// ---------------------------------------------------------------- what a branch is compared with

/**
 * A clone of a repository with `master` and `develop` (one commit ahead), and a worktree per
 * way of creating a branch, each with one commit of its own (`<name>.txt`). The environment
 * drops every inherited GIT_* variable, and HOME holds the only git configuration.
 */
async function withBranches(run: (h: { repo: string; wt: (name: string) => string; git: (cwd: string, ...args: string[]) => string; host: HostMonitor }) => Promise<void>) {
  if (process.platform !== 'linux') return;
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'twb-base-')));
  const env = { PATH: process.env.PATH, HOME: home, GIT_CONFIG_NOSYSTEM: '1' };
  const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, ...args], { env, stdio: 'pipe' }).toString().trim();
  const commit = (cwd: string, file: string) => {
    writeFileSync(join(cwd, file), `${file}\n`);
    git(cwd, 'add', file);
    git(cwd, 'commit', '-qm', file);
  };
  try {
    writeFileSync(join(home, '.gitconfig'), '[user]\n\tname = t\n\temail = t@example.org\n[init]\n\tdefaultBranch = master\n');
    const seed = join(home, 'seed');
    mkdirSync(seed);
    git(seed, 'init', '-q');
    commit(seed, 'one.txt');
    git(seed, 'checkout', '-qb', 'develop');
    commit(seed, 'dev.txt');
    // A branch of origin that the clone checks out as its own.
    git(seed, 'branch', 'own');
    git(seed, 'checkout', '-q', 'master');
    const repo = join(home, 'repo');
    git(home, 'clone', '-q', seed, repo);
    const wt = (name: string) => join(home, 'wt', name);
    const host = {
      name: 'test',
      exec: {
        shell: (script: string) =>
          new Promise<string>((ok, ko) => execFile('/bin/sh', ['-c', script], { env, encoding: 'utf8' }, (e, out, err) => (e ? ko(new Error(err)) : ok(out)))),
        spawnShell: (script: string) => spawn('/bin/sh', ['-c', script], { env, stdio: ['ignore', 'pipe', 'pipe'] }),
      },
    } as unknown as HostMonitor;
    const made = (name: string, ...add: string[]) => {
      git(repo, 'worktree', 'add', '--quiet', ...add);
      commit(wt(name), `${name}.txt`);
    };
    // The hub's way, and a worktree added with -b from origin/develop (as git checkout -b).
    git(repo, 'branch', '--no-track', '--', 'hub', 'refs/remotes/origin/develop');
    made('hub', wt('hub'), 'hub');
    made('dashb', '--no-track', '-b', 'dashb', wt('dashb'), 'origin/develop');
    // A name that ends in F, as the line that closes the script's header.
    git(repo, 'branch', '--no-track', '--', 'tipF', 'refs/remotes/origin/develop');
    made('tipF', wt('tipF'), 'tipF');
    // From a local develop that origin has, and from a local prueba that origin lacks.
    git(repo, 'branch', 'develop', 'origin/develop');
    git(repo, 'branch', 'fromlocal', 'develop');
    made('fromlocal', wt('fromlocal'), 'fromlocal');
    git(repo, 'branch', 'prueba', 'origin/master');
    git(repo, 'branch', 'fromprueba', 'prueba');
    made('fromprueba', wt('fromprueba'), 'fromprueba');
    // No usable note: HEAD, a hash, a branch that is gone, a reflog removed.
    made('fromhead', '-b', 'fromhead', wt('fromhead'));
    git(repo, 'branch', 'fromhash', git(repo, 'rev-parse', 'origin/develop'));
    made('fromhash', wt('fromhash'), 'fromhash');
    git(repo, 'branch', 'tmp', 'origin/develop');
    git(repo, 'branch', 'fromgone', 'tmp');
    git(repo, 'branch', '-D', 'tmp');
    made('fromgone', wt('fromgone'), 'fromgone');
    git(repo, 'branch', 'nolog', 'origin/develop');
    rmSync(join(repo, '.git', 'logs', 'refs', 'heads', 'nolog'));
    made('nolog', wt('nolog'), 'nolog');
    // The branch's own copy on origin, as the hub does when the branch is already there.
    made('own', '--track', '-b', 'own', wt('own'), 'refs/remotes/origin/own');
    await run({ repo, wt, git, host });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

const changed = (c: GitChanges) => c.files.map((f) => f.path);

test('the whole branch is compared with the branch it was created from', () =>
  withBranches(async ({ wt, host }) => {
    for (const [name, ref] of [
      ['hub', 'origin/develop'],
      ['dashb', 'origin/develop'],
      ['tipF', 'origin/develop'],
      ['fromlocal', 'origin/develop'],
      ['fromprueba', 'prueba'],
    ] as const) {
      const c = await gitChanges(host, wt(name), 'auto');
      assert.equal(c.mode, 'branch', name);
      assert.equal(c.base?.ref, ref, name);
      assert.equal(c.defaultBase, ref, name);
      assert.deepEqual(changed(c), [`${name}.txt`], name);
      const s = await gitStat(host, wt(name));
      assert.deepEqual(s, { mode: 'branch', base: ref, added: 1, removed: 0, files: 1 }, name);
    }
  }));

test('without a usable creation note, the whole branch is compared with the main branch', () =>
  withBranches(async ({ wt, host }) => {
    for (const [name, files] of [
      ['fromhead', ['fromhead.txt']],
      ['fromhash', ['dev.txt', 'fromhash.txt']],
      ['fromgone', ['dev.txt', 'fromgone.txt']],
      ['nolog', ['dev.txt', 'nolog.txt']],
      ['own', ['dev.txt', 'own.txt']],
    ] as const) {
      const c = await gitChanges(host, wt(name), 'auto');
      assert.equal(c.mode, 'branch', name);
      assert.equal(c.base?.ref, 'origin/master', name);
      assert.equal(c.defaultBase, 'origin/master', name);
      assert.deepEqual(changed(c), files, name);
      assert.equal((await gitStat(host, wt(name)))?.base, 'origin/master', name);
    }
  }));

test('on the main branch the changes open on what has no commit yet', () =>
  withBranches(async ({ repo, host }) => {
    writeFileSync(join(repo, 'one.txt'), 'changed\n');
    const c = await gitChanges(host, repo, 'auto');
    assert.equal(c.mode, 'head');
    assert.equal(c.defaultBase, 'origin/master');
    assert.deepEqual(changed(c), ['one.txt']);
    assert.equal((await gitStat(host, repo))?.mode, 'head');
  }));

test('the whole branch can be compared with another branch of origin', () =>
  withBranches(async ({ wt, host }) => {
    const c = await gitChanges(host, wt('hub'), 'branch', 'master');
    assert.equal(c.mode, 'branch');
    assert.equal(c.base?.ref, 'origin/master');
    assert.equal(c.defaultBase, 'origin/develop');
    assert.deepEqual(changed(c), ['dev.txt', 'hub.txt']);
    // origin's branches, without its HEAD.
    assert.deepEqual(c.branches, ['develop', 'master', 'own']);
    assert.deepEqual((await gitChanges(host, wt('hub'), 'auto')).branches, ['develop', 'master', 'own']);
    // A branch origin does not have, even when the machine has it locally.
    await assert.rejects(gitChanges(host, wt('hub'), 'branch', 'prueba'), (err: Error & { status?: number }) => {
      assert.match(err.message, /prueba ya no está en origin/);
      assert.equal(err.status, 404);
      return true;
    });
    // What has no commit yet does not depend on any branch.
    const head = await gitChanges(host, wt('hub'), 'head', 'master');
    assert.equal(head.mode, 'head');
    assert.equal(head.base?.ref, 'origin/develop');
    assert.deepEqual(changed(head), []);
  }));
