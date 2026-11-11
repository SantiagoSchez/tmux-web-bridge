import assert from 'node:assert/strict';
import { execFileSync, execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { gitScript, parseGit } from './git.js';

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
