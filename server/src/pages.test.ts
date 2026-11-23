import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { FileError } from './files.js';
import type { HostMonitor } from './host.js';
import { pagePath, pageTarget, PageTokens, statPageFile } from './pages.js';

// ---------------------------------------------------------------- tokens

const HOUR = 3600_000;

/** Tokens on a clock the test moves. */
function tokens(max?: number) {
  let now = 1_000_000;
  const store = new PageTokens(() => now, max);
  return { store, wait: (ms: number) => (now += ms) };
}

test('an issued token gives back the machine, the folder and the session it was issued for', () => {
  const { store } = tokens();
  const t = store.issue({ host: 'dev-box', dir: '/home/u/web', session: 's1' });
  assert.match(t, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(store.get(t), { host: 'dev-box', dir: '/home/u/web', session: 's1' });
  assert.notEqual(store.issue({ host: 'dev-box', dir: '/home/u/web', session: 's1' }), t);
});

test('a token unused for 24 hours stops working; one used within that keeps working', () => {
  const { store, wait } = tokens();
  const used = store.issue({ host: 'h', dir: '/a', session: null });
  const idle = store.issue({ host: 'h', dir: '/b', session: null });
  for (let i = 0; i < 3; i++) {
    wait(23 * HOUR);
    assert.ok(store.get(used));
  }
  assert.equal(store.get(idle), null);
  wait(24 * HOUR + 1);
  assert.equal(store.get(used), null);
});

test('closing a session stops its tokens and keeps the others', () => {
  const { store } = tokens();
  const mine = store.issue({ host: 'h', dir: '/a', session: 's1' });
  const other = store.issue({ host: 'h', dir: '/a', session: 's2' });
  const none = store.issue({ host: 'h', dir: '/a', session: null });
  store.dropSessions(['s1']);
  assert.equal(store.get(mine), null);
  assert.ok(store.get(other));
  assert.ok(store.get(none));
});

test('past the most tokens kept, the least recently used one stops working', () => {
  const { store, wait } = tokens(3);
  const a = store.issue({ host: 'h', dir: '/a', session: null });
  wait(1);
  const b = store.issue({ host: 'h', dir: '/b', session: null });
  wait(1);
  const c = store.issue({ host: 'h', dir: '/c', session: null });
  wait(1);
  assert.ok(store.get(a));
  store.issue({ host: 'h', dir: '/d', session: null });
  assert.equal(store.get(b), null);
  assert.ok(store.get(a));
  assert.ok(store.get(c));
});

test('an unknown token gives nothing', () => {
  const { store } = tokens();
  store.issue({ host: 'h', dir: '/a', session: null });
  assert.equal(store.get('x'.repeat(43)), null);
  assert.equal(store.get(''), null);
});

// ---------------------------------------------------------------- paths below a page

test('a page asks for files of its folder and of the folders below it', () => {
  assert.equal(pagePath('informe.html'), 'informe.html');
  assert.equal(pagePath('img/logo.png'), 'img/logo.png');
  assert.equal(pagePath('a b/c.css'), 'a b/c.css');
  assert.equal(pagePath("it's/$HOME.txt"), "it's/$HOME.txt");
});

test('a page never gets a hidden file, a folder above, or an odd path', () => {
  for (const p of ['', '.env', '.git/config', 'img/.hidden.png', '.', '..', '../notas.txt', 'a/../b', './a', 'a//b', 'a/', '/etc/passwd', 'a\\b', 'a\0b', 'a\nb']) {
    assert.equal(pagePath(p), null, JSON.stringify(p));
  }
});

// ---------------------------------------------------------------- the machine's side

/** A host whose scripts run here under /bin/sh. */
function shHost(): HostMonitor {
  return {
    name: 'Prueba',
    exec: {
      shell: (script: string) =>
        new Promise<string>((ok, ko) => execFile('/bin/sh', ['-c', script], { encoding: 'utf8', env: { PATH: process.env.PATH } }, (e, out, err) => (e ? ko(new Error(err)) : ok(out)))),
    },
  } as unknown as HostMonitor;
}

/** A temporary folder with a page's folder `web`, its files, links in and out, and a secret outside. */
function pageTree(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'twb-page-')));
  const web = join(root, 'web');
  mkdirSync(join(web, 'img'), { recursive: true });
  mkdirSync(join(web, 'sub'));
  writeFileSync(join(web, 'informe.html'), '<h1>Resumen</h1>');
  writeFileSync(join(web, 'img', 'logo.png'), '0123456789');
  writeFileSync(join(web, "it's a \"file\".css"), 'abc');
  writeFileSync(join(root, 'secreto.txt'), 'x');
  writeFileSync(join(web, 'sub', 'a.css'), 'a');
  symlinkSync(join(root, 'secreto.txt'), join(web, 'clave'));
  symlinkSync(join(web, 'informe.html'), join(web, 'atajo.html'));
  symlinkSync(root, join(web, 'arriba'));
  symlinkSync(web, join(root, 'enlace-web'));
  return root;
}

const refused = async (p: Promise<unknown>) => {
  await assert.rejects(p, (err: unknown) => err instanceof FileError && err.status === 404);
};

test('a file below the page\'s folder gives its whole path and size, whatever its name', async () => {
  const root = pageTree();
  try {
    const web = join(root, 'web');
    assert.deepEqual(await statPageFile(shHost(), web, 'informe.html'), { path: join(web, 'informe.html'), size: 16 });
    assert.deepEqual(await statPageFile(shHost(), web, 'img/logo.png'), { path: join(web, 'img/logo.png'), size: 10 });
    assert.deepEqual(await statPageFile(shHost(), web, `it's a "file".css`), { path: join(web, `it's a "file".css`), size: 3 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a missing file, a folder and any symbolic link below the page are refused', async () => {
  const root = pageTree();
  try {
    const web = join(root, 'web');
    await refused(statPageFile(shHost(), web, 'falta.css'));
    await refused(statPageFile(shHost(), web, 'img'));
    await refused(statPageFile(shHost(), web, 'clave'));
    await refused(statPageFile(shHost(), web, 'atajo.html'));
    await refused(statPageFile(shHost(), web, 'arriba/secreto.txt'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a page whose folder is reached through a link still gets its files', async () => {
  const root = pageTree();
  try {
    assert.equal((await statPageFile(shHost(), join(root, 'enlace-web'), 'sub/a.css')).size, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a page is issued for the real folder of its file, not the link it was opened through', async () => {
  const root = pageTree();
  try {
    const web = { dir: join(root, 'web'), name: 'informe.html' };
    assert.deepEqual(await pageTarget(shHost(), join(root, 'web', 'informe.html')), web);
    assert.deepEqual(await pageTarget(shHost(), join(root, 'enlace-web', 'informe.html')), web);
    await refused(pageTarget(shHost(), join(root, 'no-hay', 'informe.html')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a page opened through a symbolic link is the file it points to, links of links and relative ones too', async () => {
  const root = pageTree();
  try {
    mkdirSync(join(root, 'informes'));
    writeFileSync(join(root, 'informes', 'informe.html'), '<h1>Real</h1>');
    symlinkSync('informes/informe.html', join(root, 'ultimo.html'));
    symlinkSync(join(root, 'ultimo.html'), join(root, 'web', 'cadena.html'));
    const real = { dir: join(root, 'informes'), name: 'informe.html' };
    assert.deepEqual(await pageTarget(shHost(), join(root, 'ultimo.html')), real);
    assert.deepEqual(await pageTarget(shHost(), join(root, 'web', 'cadena.html')), real);
    assert.deepEqual(await pageTarget(shHost(), join(root, 'web', 'atajo.html')), { dir: join(root, 'web'), name: 'informe.html' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a loop of links, or a link to nothing, gives no page', async () => {
  const root = pageTree();
  try {
    symlinkSync('b.html', join(root, 'a.html'));
    symlinkSync('a.html', join(root, 'b.html'));
    symlinkSync('falta.html', join(root, 'roto.html'));
    await refused(pageTarget(shHost(), join(root, 'a.html')));
    await refused(pageTarget(shHost(), join(root, 'roto.html')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
