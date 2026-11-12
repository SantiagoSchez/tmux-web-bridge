import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findPaths } from '../../shared/paths.js';
import { resolvePath } from './files.js';

const paths = (line: string) => findPaths(line).map((h) => (h.line ? `${h.path}:${h.line}` : h.path));

test('paths Claude Code prints become links, with their line', () => {
  assert.deepEqual(paths('● Update(server/src/tasks.ts)'), ['server/src/tasks.ts']);
  assert.deepEqual(paths('  ⎿  Read web/src/components/Dialogs.tsx (612 lines)'), ['web/src/components/Dialogs.tsx']);
  assert.deepEqual(paths('Mira `server/src/index.ts:42` y README.md.'), ['server/src/index.ts:42', 'README.md']);
  assert.deepEqual(paths('Guardé /tmp/captura.png y ~/notas/plan.md'), ['/tmp/captura.png', '~/notas/plan.md']);
  assert.deepEqual(paths('en ./scripts/test-kit-update.sh:10:3'), ['./scripts/test-kit-update.sh:10']);
  assert.deepEqual(paths('el binario /usr/local/bin/claude'), ['/usr/local/bin/claude']);
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
