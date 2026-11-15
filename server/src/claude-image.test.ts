import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { imageScript, isImageRef, parseImage } from './claude-image.js';

// Random ids: the script also looks in the real /tmp, where this machine's own sessions are.
const SESSION = randomUUID();
const OTHER = randomUUID();

/** Runs the lookup the way the hub does on a machine whose temporary folder is `tmp`. */
const lookup = (tmp: string, session: string, n: number) =>
  new Promise<string | undefined>((resolve, reject) =>
    execFile('/bin/sh', ['-c', imageScript(session, n)], { env: { PATH: process.env.PATH, HOME: tmp, TMPDIR: tmp } }, (err, out) => (err ? reject(err) : resolve(parseImage(out)))),
  );

/** An image as Claude Code saves it: <tmp>/claude-<uid>/<cwd>/<session>/images/<name>, modified `ago` seconds back. */
function image(tmp: string, cwd: string, session: string, name: string, ago: number): string {
  const dir = join(tmp, `claude-${userInfo().uid}`, cwd, session, 'images');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name);
  writeFileSync(file, name);
  const t = Date.now() / 1000 - ago;
  utimesSync(file, t, t);
  return file;
}

async function withTmp(fn: (tmp: string) => Promise<void>): Promise<void> {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'twb-img-')));
  try {
    await fn(tmp);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

test('finds the image Claude Code saved for a number, whatever its extension', () =>
  withTmp(async (tmp) => {
    const png = image(tmp, '-home-u-proyecto', SESSION, '1.png', 60);
    const jpg = image(tmp, '-home-u-proyecto', SESSION, '2.jpg', 30);
    assert.equal(await lookup(tmp, SESSION, 1), png);
    assert.equal(await lookup(tmp, SESSION, 2), jpg);
  }));

test('a session with folders under two working directories gives the newest file', () =>
  withTmp(async (tmp) => {
    image(tmp, '-home-u-proyecto', SESSION, '3.png', 600);
    const newer = image(tmp, "-home-u-worktrees-con 'comilla", SESSION, '3.png', 5);
    assert.equal(await lookup(tmp, SESSION, 3), newer);
  }));

test('another session, another number or nothing saved give no image', () =>
  withTmp(async (tmp) => {
    image(tmp, '-home-u-proyecto', OTHER, '1.png', 10);
    image(tmp, '-home-u-proyecto', SESSION, '12.png', 10);
    assert.equal(await lookup(tmp, SESSION, 1), undefined);
    assert.equal(await lookup(tmp, SESSION, 4), undefined);
    rmSync(join(tmp, `claude-${userInfo().uid}`), { recursive: true });
    assert.equal(await lookup(tmp, SESSION, 12), undefined);
  }));

test('only a session id and a small number go into the script', () => {
  assert.equal(isImageRef(SESSION, 1), true);
  assert.equal(isImageRef(SESSION, 9999), true);
  for (const [session, n] of [['../../etc', 1], ['*', 1], [`${SESSION}/..`, 1], ['', 1], [SESSION, 0], [SESSION, 10000], [SESSION, 1.5], [SESSION, Number.NaN]] as const)
    assert.equal(isImageRef(session, n), false, `${session} ${n}`);
});
