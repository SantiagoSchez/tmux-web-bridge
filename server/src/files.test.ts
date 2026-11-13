import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findPaths, findPathsInRows } from '../../shared/paths.js';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findInReposScript, parseRange, resolvePath, statHostFile, streamHostFile } from './files.js';
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
