import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { contextScript, parseContext } from './project-refs.js';

// The environment drops every inherited GIT_* variable: a GIT_DIR from a git hook would
// otherwise point these commands at the real repository.
const env = (home: string) => ({ PATH: process.env.PATH, HOME: home });

const sh = (script: string, home: string) =>
  new Promise<string>((resolve, reject) => execFile('/bin/sh', ['-c', script], { env: env(home) }, (err, out) => (err ? reject(err) : resolve(out))));

/** A repository at home/<name> with an optional origin, ka.json and koalarnes.json, and a subfolder to stand in. */
function repo(home: string, name: string, opts: { origin?: string; ka?: string; koalarnes?: string } = {}): string {
  const dir = join(home, name);
  mkdirSync(join(dir, 'sub', 'deep'), { recursive: true });
  execFileSync('git', ['-C', dir, 'init', '-q'], { env: env(home), stdio: 'pipe' });
  if (opts.origin) execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', opts.origin], { env: env(home), stdio: 'pipe' });
  if (opts.ka !== undefined || opts.koalarnes !== undefined) mkdirSync(join(dir, '.claude'));
  if (opts.ka !== undefined) writeFileSync(join(dir, '.claude', 'ka.json'), opts.ka);
  if (opts.koalarnes !== undefined) writeFileSync(join(dir, '.claude', 'koalarnes.json'), opts.koalarnes);
  return dir;
}

async function withHome(fn: (home: string) => Promise<void>): Promise<void> {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'twb-refs-')));
  try {
    await fn(home);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

const CONFIG = JSON.stringify(
  { platform: { host: 'github', repository: 'owner/repo' }, tracker: { kind: 'trello', board: '0mGPkF10' }, layers: [{ name: 'web\tlayer' }] },
  null,
  2,
);

test('koalarnes.json gives the repository and the Trello board, from any subfolder of the project', () =>
  withHome(async (home) => {
    const dir = repo(home, "proyecto con 'comilla", { koalarnes: CONFIG });
    assert.deepEqual(parseContext(await sh(contextScript(join(dir, 'sub', 'deep')), home)), {
      repo: { host: 'github', path: 'owner/repo' },
      trelloBoard: '0mGPkF10',
    });
  }));

test('ka.json gives the repository and the Trello board, from any subfolder of the project', () =>
  withHome(async (home) => {
    const dir = repo(home, 'p', { ka: CONFIG, origin: 'git@bitbucket.org:otro/sitio.git' });
    assert.deepEqual(parseContext(await sh(contextScript(join(dir, 'sub', 'deep')), home)), {
      repo: { host: 'github', path: 'owner/repo' },
      trelloBoard: '0mGPkF10',
    });
  }));

test('ka.json wins over koalarnes.json as a whole: a key it lacks is not taken from the old file', () =>
  withHome(async (home) => {
    const old = JSON.stringify({ platform: { host: 'bitbucket', repository: 'viejo/repo' }, tracker: { kind: 'trello', board: 'OldBoard' } });
    const dir = repo(home, 'p', { ka: JSON.stringify({ platform: { host: 'github', repository: 'nuevo/repo' } }), koalarnes: old });
    assert.deepEqual(parseContext(await sh(contextScript(dir), home)), { repo: { host: 'github', path: 'nuevo/repo' } });
  }));

test('koalarnes.json wins over the origin remote', () =>
  withHome(async (home) => {
    const dir = repo(home, 'p', { koalarnes: CONFIG, origin: 'git@bitbucket.org:otro/sitio.git' });
    assert.deepEqual(parseContext(await sh(contextScript(dir), home)).repo, { host: 'github', path: 'owner/repo' });
  }));

test('without koalarnes.json the origin remote gives the repository, and there is no board', () =>
  withHome(async (home) => {
    const dir = repo(home, 'p', { origin: 'git@bitbucket.org:workspace/repo.git' });
    assert.deepEqual(parseContext(await sh(contextScript(join(dir, 'sub')), home)), { repo: { host: 'bitbucket', path: 'workspace/repo' } });
  }));

test('a koalarnes.json without a repository falls back to the origin remote', () =>
  withHome(async (home) => {
    const dir = repo(home, 'p', { koalarnes: '{"tracker":{"kind":"github-issues"}}', origin: 'https://github.com/a/b.git' });
    assert.deepEqual(parseContext(await sh(contextScript(dir), home)), { repo: { host: 'github', path: 'a/b' } });
  }));

test('a malformed koalarnes.json is ignored and the origin remote is used', () =>
  withHome(async (home) => {
    const dir = repo(home, 'p', { koalarnes: '{ "platform": ', origin: 'https://github.com/a/b' });
    assert.deepEqual(parseContext(await sh(contextScript(dir), home)), { repo: { host: 'github', path: 'a/b' } });
  }));

test('values koalarnes.json gets wrong are dropped', () =>
  withHome(async (home) => {
    const bad = JSON.stringify({ platform: { host: 'gitlab', repository: 'a/b' }, tracker: { kind: 'trello', board: 'x/../y' } });
    const dir = repo(home, 'p', { koalarnes: bad });
    assert.deepEqual(parseContext(await sh(contextScript(dir), home)), {});
  }));

test('a folder outside git, or one that is gone, gives nothing to link', () =>
  withHome(async (home) => {
    mkdirSync(join(home, 'suelta'));
    assert.deepEqual(parseContext(await sh(contextScript(join(home, 'suelta')), home)), {});
    assert.deepEqual(parseContext(await sh(contextScript(join(home, 'no-existe')), home)), {});
  }));
