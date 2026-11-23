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
const IP = '100.64.0.7';

/** Tokens on a clock the test moves, with the sessions the test says are alive. */
function tokens(max?: number) {
  let now = 1_000_000;
  const gone = new Set<string>();
  const asked: string[] = [];
  const store = new PageTokens({
    now: () => now,
    max,
    sessionAlive: (id) => {
      asked.push(id);
      return !gone.has(id);
    },
  });
  return { store, wait: (ms: number) => (now += ms), end: (id: string) => gone.add(id), asked };
}

const grant = (dir: string, session: string | null = null) => ({ host: 'h', dir, only: null, session, ip: IP });

test('an issued token gives back the machine, the folder, the file it is limited to and the session it was issued for', () => {
  const { store } = tokens();
  const t = store.issue({ host: 'dev-box', dir: '/home/u/web', only: null, session: 's1', ip: IP });
  assert.match(t, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(store.get(t, IP), { host: 'dev-box', dir: '/home/u/web', only: null, session: 's1', ip: IP });
  const only = store.issue({ host: 'dev-box', dir: '/home/u', only: 'informe.html', session: 's1', ip: IP });
  assert.notEqual(only, t);
  assert.equal(store.get(only, IP)?.only, 'informe.html');
});

test('a token stops working 24 hours after its issue, however often it is used', () => {
  const { store, wait } = tokens();
  const t = store.issue(grant('/a'));
  for (let i = 0; i < 23; i++) {
    wait(HOUR);
    assert.ok(store.get(t, IP), `hour ${i + 1}`);
  }
  wait(HOUR - 1);
  assert.ok(store.get(t, IP));
  wait(2);
  assert.equal(store.get(t, IP), null);
});

test('a token works only from the address it was issued for', () => {
  const { store } = tokens();
  const t = store.issue(grant('/a'));
  assert.equal(store.get(t, '203.0.113.9'), null);
  assert.equal(store.get(t, ''), null);
  assert.ok(store.get(t, IP));
});

test('a token stops working when its session no longer exists; one without a session never asks', () => {
  const { store, end, asked } = tokens();
  const mine = store.issue(grant('/a', 's1'));
  const other = store.issue(grant('/a', 's2'));
  const none = store.issue(grant('/a'));
  end('s1');
  assert.equal(store.get(mine, IP), null);
  assert.ok(store.get(other, IP));
  assert.ok(store.get(none, IP));
  assert.deepEqual(asked, ['s1', 's2']);
});

test('closing a session stops its tokens and keeps the others', () => {
  const { store } = tokens();
  const mine = store.issue(grant('/a', 's1'));
  const other = store.issue(grant('/a', 's2'));
  const none = store.issue(grant('/a'));
  store.dropSessions(['s1']);
  assert.equal(store.get(mine, IP), null);
  assert.ok(store.get(other, IP));
  assert.ok(store.get(none, IP));
});

test('past the most tokens kept, the least recently used one stops working', () => {
  const { store, wait } = tokens(3);
  const a = store.issue(grant('/a'));
  wait(1);
  const b = store.issue(grant('/b'));
  wait(1);
  const c = store.issue(grant('/c'));
  wait(1);
  assert.ok(store.get(a, IP));
  store.issue(grant('/d'));
  assert.equal(store.get(b, IP), null);
  assert.ok(store.get(a, IP));
  assert.ok(store.get(c, IP));
});

test('an unknown token gives nothing', () => {
  const { store } = tokens();
  store.issue(grant('/a'));
  assert.equal(store.get('x'.repeat(43), IP), null);
  assert.equal(store.get('', IP), null);
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

/** A host whose scripts run here under /bin/sh, with a home folder that does not exist unless `env` gives one. */
function shHost(env: Record<string, string> = {}): HostMonitor {
  return {
    name: 'Prueba',
    exec: {
      shell: (script: string) =>
        new Promise<string>((ok, ko) =>
          execFile('/bin/sh', ['-c', script], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: '/no-existe', ...env } }, (e, out, err) => (e ? ko(new Error(err)) : ok(out))),
        ),
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
    const web = { dir: join(root, 'web'), name: 'informe.html', broad: false };
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
    const real = { dir: join(root, 'informes'), name: 'informe.html', broad: false };
    assert.deepEqual(await pageTarget(shHost(), join(root, 'ultimo.html')), real);
    assert.deepEqual(await pageTarget(shHost(), join(root, 'web', 'cadena.html')), real);
    assert.deepEqual(await pageTarget(shHost(), join(root, 'web', 'atajo.html')), { dir: join(root, 'web'), name: 'informe.html', broad: false });
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

test('a page in the home folder, above it or in a temporary root is marked broad; one in a folder of its own is not', async () => {
  const root = pageTree();
  try {
    const home = join(root, 'casa');
    const temp = join(root, 'temporal');
    for (const d of [join(home, 'web'), join(temp, 'sub')]) mkdirSync(d, { recursive: true });
    for (const d of [root, home, temp, join(home, 'web'), join(temp, 'sub')]) writeFileSync(join(d, 'informe.html'), '<h1>x</h1>');
    symlinkSync(home, join(root, 'enlace-casa'));
    const host = shHost({ HOME: join(root, 'enlace-casa'), TMPDIR: `${temp}/` });
    const broad = async (dir: string) => (await pageTarget(host, join(dir, 'informe.html'))).broad;
    assert.equal(await broad(home), true, 'home');
    assert.equal(await broad(root), true, 'above home');
    assert.equal(await broad(temp), true, 'TMPDIR');
    assert.equal(await broad(join(home, 'web')), false, 'a folder of the home');
    assert.equal(await broad(join(temp, 'sub')), false, 'a folder of TMPDIR');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
