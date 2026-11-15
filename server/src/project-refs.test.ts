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

/** A repository at home/<name> with an optional origin and koalarnes.json, and a subfolder to stand in. */
function repo(home: string, name: string, opts: { origin?: string; koalarnes?: string } = {}): string {
  const dir = join(home, name);
  mkdirSync(join(dir, 'sub', 'deep'), { recursive: true });
  execFileSync('git', ['-C', dir, 'init', '-q'], { env: env(home), stdio: 'pipe' });
  if (opts.origin) execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', opts.origin], { env: env(home), stdio: 'pipe' });
  if (opts.koalarnes !== undefined) {
    mkdirSync(join(dir, '.claude'));
    writeFileSync(join(dir, '.claude', 'koalarnes.json'), opts.koalarnes);
  }
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

const KOALARNES = JSON.stringify(
  { platform: { host: 'github', repository: 'owner/repo' }, tracker: { kind: 'trello', board: '0mGPkF10' }, layers: [{ name: 'web\tlayer' }] },
  null,
  2,
);

test('koalarnes.json gives the repository and the Trello board, from any subfolder of the project', () =>
  withHome(async (home) => {
    const dir = repo(home, "proyecto con 'comilla", { koalarnes: KOALARNES });
    assert.deepEqual(parseContext(await sh(contextScript(join(dir, 'sub', 'deep')), home)), {
      repo: { host: 'github', path: 'owner/repo' },
      trelloBoard: '0mGPkF10',
    });
  }));

test('koalarnes.json wins over the origin remote', () =>
  withHome(async (home) => {
    const dir = repo(home, 'p', { koalarnes: KOALARNES, origin: 'git@bitbucket.org:otro/sitio.git' });
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
