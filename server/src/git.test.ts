import assert from 'node:assert/strict';
import { execFileSync, execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { PaneInfo, PaneState, SessionInfo } from '../../shared/types.js';
import { GitScanner, gitScript, parseGit } from './git.js';

const sh = (script: string, home: string) =>
  new Promise<string>((resolve, reject) =>
    execFile('/bin/sh', ['-c', script], { env: { PATH: process.env.PATH, HOME: home } }, (err, out) => (err ? reject(err) : resolve(out))),
  );

test('a folder in a linked worktree gives the worktree; in the repo, its branch; outside, nothing', async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'twb-git-')));
  try {
    const repo = join(home, 'repo');
    mkdirSync(join(repo, 'sub'), { recursive: true });
    const git = (...args: string[]) =>
      execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { env: { PATH: process.env.PATH, HOME: home }, stdio: 'pipe' });
    git('init', '-q', '-b', 'main');
    git('commit', '-q', '--allow-empty', '-m', 'x');
    git('worktree', 'add', '-q', '-b', 'feature', join(home, "wt con 'comilla"));
    mkdirSync(join(home, 'suelta'));
    const detached = join(home, 'det');
    git('worktree', 'add', '-q', '--detach', detached);
    const paths = [repo, join(repo, 'sub'), join(home, "wt con 'comilla"), join(home, 'suelta'), join(home, 'no-existe')];
    const { home: h, git: found } = parseGit(await sh(gitScript(paths), home));
    assert.equal(h, home);
    assert.deepEqual(found.get(repo), { branch: 'main' });
    assert.deepEqual(found.get(join(repo, 'sub')), { branch: 'main' });
    assert.deepEqual(found.get(join(home, "wt con 'comilla")), { worktree: "wt con 'comilla" });
    assert.equal(found.get(join(home, 'suelta')), null);
    assert.equal(found.get(join(home, 'no-existe')), null);
    // A worktree is shown by its name even with no branch checked out.
    assert.deepEqual(parseGit(await sh(gitScript([detached]), home)).git.get(detached), { worktree: 'det' });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('a repository with a harness configuration gives its active changes, read once per top folder; one without gives none', async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'twb-git-')));
  try {
    const env = { PATH: process.env.PATH, HOME: home };
    const repo = (name: string) => {
      const dir = join(home, name);
      mkdirSync(dir, { recursive: true });
      execFileSync('git', ['-C', dir, 'init', '-q', '-b', 'main'], { env, stdio: 'pipe' });
      return dir;
    };
    const put = (path: string, text: string) => {
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, text);
    };
    const review = { version: 1, pr: 74, budget: { maxRounds: 3, extensions: [], resets: [] }, rounds: [{ n: 1, counted: true }, { n: 2, counted: true }], findings: [{ severity: 'REQUIRED', state: 'open' }] };

    // A ka.json repository: a change halfway with its review, one with only a proposal, the archive.
    const shop = repo('shop');
    put(join(shop, '.claude/ka.json'), '{}');
    const tasks = ['## 1. A', ...Array(5).fill('- [x] done'), '  - [X] nested done', '- [x] last', ...Array(16).fill('- [ ] to do'), 'not - [x] a task'].join('\n');
    put(join(shop, 'openspec/changes/show-progress/tasks.md'), tasks);
    put(join(shop, 'openspec/changes/show-progress/proposal.md'), '# P');
    put(join(shop, 'openspec/changes/show-progress/review.json'), JSON.stringify(review, null, 2));
    put(join(shop, 'openspec/changes/add-export/proposal.md'), '# P');
    put(join(shop, 'openspec/changes/archive/2026-01-01-old/tasks.md'), '- [ ] old');
    mkdirSync(join(shop, 'src'));

    // A repository still on koalarnes.json, with a review registry too big to read (and a % in its name).
    const old = repo('old 100%');
    put(join(old, '.claude/koalarnes.json'), '{}');
    put(join(old, 'openspec/changes/fix-login/tasks.md'), '- [x] a\n- [ ] b\n');
    put(join(old, 'openspec/changes/fix-login/review.json'), JSON.stringify({ ...review, padding: 'x'.repeat(300_000) }));
    // A tasks.md with no checkbox gives no progress.
    put(join(old, 'openspec/changes/plan-only/tasks.md'), '# Tasks\n\nTo be written.\n');

    // Changes without a harness configuration.
    const bare = repo('bare');
    put(join(bare, 'openspec/changes/add-export/tasks.md'), '- [ ] a\n');

    const out = await sh(gitScript([shop, join(shop, 'src'), old, bare]), home);
    // The shop's changes come once, though two of its folders were asked for.
    assert.equal(out.split('\n').filter((l) => l.startsWith('S\t') && l.includes('show-progress')).length, 1);
    const { changes } = parseGit(out);
    const shopChanges = [
      { name: 'add-export', path: join(shop, 'openspec/changes/add-export'), proposal: true },
      {
        name: 'show-progress',
        path: join(shop, 'openspec/changes/show-progress'),
        tasks: { done: 7, total: 23 },
        proposal: true,
        review: { pr: 74, round: { n: 2, of: 3 }, blockers: 1 },
      },
    ];
    assert.deepEqual(changes.get(shop), shopChanges);
    assert.deepEqual(changes.get(join(shop, 'src')), shopChanges);
    assert.deepEqual(changes.get(old), [
      { name: 'fix-login', path: join(old, 'openspec/changes/fix-login'), tasks: { done: 1, total: 2 }, proposal: false },
      { name: 'plan-only', path: join(old, 'openspec/changes/plan-only'), proposal: false },
    ]);
    assert.equal(changes.get(bare), undefined);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('a change name that would break the lines is skipped, and the caps on changes and registries hold', async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'twb-git-')));
  try {
    const env = { PATH: process.env.PATH, HOME: home };
    const dir = join(home, 'shop');
    mkdirSync(join(dir, '.claude'), { recursive: true });
    execFileSync('git', ['-C', dir, 'init', '-q', '-b', 'main'], { env, stdio: 'pipe' });
    writeFileSync(join(dir, '.claude/ka.json'), '{}');
    const change = (name: string, files: Record<string, string>) => {
      mkdirSync(join(dir, 'openspec/changes', name), { recursive: true });
      for (const [file, text] of Object.entries(files)) writeFileSync(join(dir, 'openspec/changes', name, file), text);
    };
    const review = JSON.stringify({ version: 1, pr: 74, budget: { maxRounds: 3, extensions: [], resets: [] }, rounds: [], findings: [] });
    // A line break in a name would print a forged H line: the machine's home must not change.
    // The name sorts first, so the cap on changes does not hide it.
    change('a\nH\tforged', { 'proposal.md': '# P' });
    change('bad-json', { 'tasks.md': '- [x] a\n- [ ] b\n', 'review.json': '{"version": 1, "pr": 74,' });
    change('big-review', { 'review.json': JSON.stringify({ ...JSON.parse(review), padding: 'x'.repeat(100_000) }) });
    for (let i = 1; i <= 19; i++) change(`c${String(i).padStart(2, '0')}`, { 'proposal.md': '# P' });

    const { home: h, changes } = parseGit(await sh(gitScript([dir]), home));
    assert.equal(h, home);
    const names = (changes.get(dir) ?? []).map((c) => c.name);
    assert.equal(names.length, 20, 'at most 20 changes of a repository');
    assert.ok(!names.includes('c19'), 'the first 20 in name order');
    assert.ok(!names.some((n) => n.includes('\n') || n.includes('\t')));
    const byName = new Map((changes.get(dir) ?? []).map((c) => [c.name, c]));
    assert.deepEqual(byName.get('bad-json'), { name: 'bad-json', path: join(dir, 'openspec/changes/bad-json'), tasks: { done: 1, total: 2 }, proposal: false });
    assert.equal(byName.get('big-review')?.review, undefined, 'a registry over 64 KB is not read');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('a pane changing state reads the folders again before the 15 s, also when seen during a reading', async () => {
  const pending: ((out: string) => void)[] = [];
  const scanner = new GitScanner({ shell: () => new Promise<string>((resolve) => pending.push(resolve)) }, () => {});
  const pane = (id: string, state: PaneState | null): PaneInfo => ({
    id,
    index: 0,
    active: true,
    command: 'claude',
    path: '/srv/a',
    title: '',
    icon: '',
    state,
    width: 80,
    height: 24,
    left: 0,
    top: 0,
    dead: false,
    inMode: false,
  });
  const tree = (...panes: PaneInfo[]): SessionInfo[] => [
    {
      id: '$1',
      name: 'demo',
      created: 0,
      num: 1,
      icon: '',
      attached: 0,
      windows: [{ id: '@1', index: 1, name: 'w', active: true, icon: '', state: null, pinned: false, bell: false, activity: false, zoomed: false, panes }],
    },
  ];
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  const finish = async () => {
    const resolve = pending.shift();
    assert.ok(resolve, 'a reading is running');
    resolve('N\t/srv/a\n');
    await settle();
  };

  scanner.apply(tree(pane('%1', 'busy'))); // a new folder: read
  assert.equal(pending.length, 1);
  await finish();
  scanner.apply(tree(pane('%1', 'busy'))); // the same panes and states: not again
  assert.equal(pending.length, 0);
  scanner.apply(tree(pane('%1', 'busy'), pane('%2', 'claude'))); // a pane seen for the first time is no change
  assert.equal(pending.length, 0);

  scanner.apply(tree(pane('%1', 'done'), pane('%2', 'claude'))); // a pane changed state: read again
  assert.equal(pending.length, 1);

  scanner.apply(tree(pane('%1', 'busy'), pane('%2', 'claude'))); // another change, during that reading
  assert.equal(pending.length, 1, 'never two readings at once');
  await finish();
  scanner.apply(tree(pane('%1', 'busy'), pane('%2', 'claude')));
  assert.equal(pending.length, 1, 'the change seen during the reading reads once it ends');
  await finish();
  scanner.apply(tree(pane('%1', 'busy'), pane('%2', 'claude')));
  assert.equal(pending.length, 0);
});
