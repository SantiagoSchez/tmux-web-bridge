import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseShortcut, serializeShortcut } from '../../shared/dictation.js';

test('shortcuts round-trip in their canonical form', () => {
  for (const s of ['ctrl+shift+Space', 'alt+KeyD', 'F9', 'ctrl+alt+shift+meta+Period', 'shift+meta+KeyK']) {
    const sc = parseShortcut(s);
    assert.ok(sc, s);
    assert.equal(serializeShortcut(sc), s);
  }
});

test('combinations that would type, or that the terminal or the app already use, are refused', () => {
  for (const s of ['Space', 'shift+KeyA', 'ctrl+KeyC', 'ctrl+Digit3', 'ctrl+shift+Digit1', 'meta+KeyK', 'shift+ctrl+Space', 'ctrl+ctrl+Space', 'hyper+Space', 'ctrl+Nope', '']) {
    assert.equal(parseShortcut(s), null, s);
  }
});
