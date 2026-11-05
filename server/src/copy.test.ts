import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cellWidth, cleanCopy } from '../../shared/copy.js';

const lines = (...l: string[]) => l.join('\n');

test("Claude's paragraphs are put back together, without its bullet and indent", () => {
  const copied = lines(
    '● Tengo una idea clara del motor. Miro el demo    ',
    '  (farol, casa, lava) y el presupuesto de vértices',
    '  antes de plantear dudas.',
  );
  assert.equal(
    cleanCopy(copied, 51),
    'Tengo una idea clara del motor. Miro el demo (farol, casa, lava) y el presupuesto de vértices antes de plantear dudas.',
  );
});

test('separate paragraphs and short lines stay apart', () => {
  const copied = lines('● Primera línea corta.', '  Segunda línea corta.', '', '  Otro párrafo.');
  assert.equal(cleanCopy(copied, 51), lines('Primera línea corta.', 'Segunda línea corta.', '', 'Otro párrafo.'));
});

test("a quote loses its bar, and is not joined to the text around it", () => {
  const copied = lines(
    '  Antes de la cita:',
    '  ▎ Esto es una cita bastante larga que Claude',
    '  ▎ parte en varias líneas al ancho del terminal.',
    '  Y esto va después de la cita, aparte del todo.',
  );
  assert.equal(
    cleanCopy(copied, 51),
    lines(
      'Antes de la cita:',
      'Esto es una cita bastante larga que Claude parte en varias líneas al ancho del terminal.',
      'Y esto va después de la cita, aparte del todo.',
    ),
  );
});

test('list items keep apart, and each one is joined to its own continuation', () => {
  const copied = lines(
    '  - Un elemento de la lista con bastante texto que',
    '    sigue en la línea de abajo.',
    '  - Otro elemento con muchísimo texto, tanto que',
    '    no cabe.',
    '    - Uno anidado.',
  );
  assert.equal(
    cleanCopy(copied, 51),
    lines(
      '- Un elemento de la lista con bastante texto que sigue en la línea de abajo.',
      '- Otro elemento con muchísimo texto, tanto que no cabe.',
      '  - Uno anidado.',
    ),
  );
});

test('a wrapped command joins with a space, a long word broken at the edge without one', () => {
  assert.equal(cleanCopy(lines('  git log --oneline --graph --decorate --all and', '  more'), 51), 'git log --oneline --graph --decorate --all and more');
  const url = 'https://example.com/' + 'a'.repeat(50);
  assert.equal(cleanCopy(lines(url.slice(0, 50), url.slice(50)), 51), url);
});

test('rules, tables, tool output and program output are left alone', () => {
  const rule = '─'.repeat(51);
  assert.equal(cleanCopy(lines(rule, 'texto'), 51), lines(rule, 'texto'));
  const table = lines('│ columna con mucho texto dentro de la tabla  │', '│ otra fila                                      │');
  assert.equal(cleanCopy(table, 51), table);
  const tool = lines('● Bash(ls)', '  ⎿  fichero.txt');
  assert.equal(cleanCopy(tool, 51), lines('Bash(ls)', '⎿  fichero.txt'));
  const ls = lines('drwxr-xr-x  2 santiago santiago 4096 nov  5 a', 'b');
  assert.equal(cleanCopy(ls, 80), ls);
});

test('a copy started mid-line counts from its column', () => {
  const copied = lines('presupuesto de vértices', '  antes de plantear dudas.');
  // From column 27 the first line ran to the edge: joined.
  assert.equal(cleanCopy(copied, 51, 27), 'presupuesto de vértices antes de plantear dudas.');
  // From the start of a short line: apart.
  assert.equal(cleanCopy(lines('corta', 'otra'), 51, 0), lines('corta', 'otra'));
  // Unknown (tmux's copy): a line without indent over indented ones is the end of a longer one.
  assert.equal(cleanCopy(copied, 51), 'presupuesto de vértices antes de plantear dudas.');
});

test('a single line only loses the bullet and the trailing spaces', () => {
  assert.equal(cleanCopy('● hola   ', 51), 'hola');
  assert.equal(cleanCopy('  ▎ citado', 51), 'citado');
  assert.equal(cleanCopy('hola', 51), 'hola');
});

test('cell widths count wide characters twice and combining marks not at all', () => {
  assert.equal(cellWidth('abc'), 3);
  assert.equal(cellWidth('日本'), 4);
  assert.equal(cellWidth('🙋'), 2);
  assert.equal(cellWidth('é'), 1);
});
