import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_KEYBAR, defaultLabel, describe, KEYBAR_MAX, keySeq, LABEL_MAX, sanitizeKeybar } from '../../shared/keybar.js';

test('keys with modifiers are encoded as xterm does', () => {
  assert.equal(keySeq('up'), '\x1b[A');
  assert.equal(keySeq('up', true), '\x1b[1;5A');
  assert.equal(keySeq('left', false, true), '\x1b[1;3D');
  assert.equal(keySeq('home', true, true), '\x1b[1;7H');
  assert.equal(keySeq('pgUp', true), '\x1b[5;5~');
  assert.equal(keySeq('del'), '\x1b[3~');
  assert.equal(keySeq('c', true), '\x03');
  assert.equal(keySeq('D', true), '\x04');
  assert.equal(keySeq('x', false, true), '\x1bx');
  assert.equal(keySeq('enter', false, true), '\x1b\r');
  assert.equal(keySeq('|'), '|');
});

test('labels and descriptions come from what the button does', () => {
  assert.equal(defaultLabel({ kind: 'key', label: '', key: 'c', ctrl: true }), '^C');
  assert.equal(defaultLabel({ kind: 'key', label: '', key: 'up', alt: true }), '⌥↑');
  assert.equal(defaultLabel({ kind: 'text', label: '', text: '/compact y algo más largo' }), '/compact y algo…');
  assert.equal(describe({ kind: 'key', label: '', key: 'd', ctrl: true }), 'Ctrl+D');
  assert.equal(describe({ kind: 'text', label: '', text: '/clear', enter: true }), 'Escribe «/clear» y pulsa Enter');
});

test('the default bar is what the bar always had', () => {
  assert.deepEqual(
    DEFAULT_KEYBAR.map((b) => b.label || defaultLabel(b)),
    ['📎', '🎤', '↑', '↓', '←', '→', 'Enter', 'Ctrl', 'Alt', '', 'Esc', '⏎ línea', '⇧Tab', '^C', '1', '2', '3', 'Tab', 'PgUp', 'PgDn', '|', '~', '/', '-'],
  );
  assert.deepEqual(sanitizeKeybar(DEFAULT_KEYBAR), DEFAULT_KEYBAR);
});

test('sanitizing trims labels and texts and caps the number of buttons', () => {
  const long = sanitizeKeybar([{ kind: 'text', label: `  ${'x'.repeat(40)}  `, text: 'hola', enter: 'yes' }]);
  assert.deepEqual(long, [{ kind: 'text', label: 'x'.repeat(LABEL_MAX), text: 'hola' }]);
  assert.equal(sanitizeKeybar(Array.from({ length: 100 }, () => ({ kind: 'key', label: '', key: 'esc' })))!.length, KEYBAR_MAX);
  assert.deepEqual(sanitizeKeybar([{ kind: 'key', label: '', key: '\x03' }, { kind: 'key', label: '', key: 'ab' }, { kind: 'key', label: '', key: 'ñ' }]), [
    { kind: 'key', label: '', key: 'ñ' },
  ]);
  assert.equal(sanitizeKeybar(null), null);
});
