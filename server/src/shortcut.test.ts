import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatShortcut,
  matchesShortcut,
  PANEL_SHORTCUTS,
  panelShortcut,
  parseShortcut,
  serializeShortcut,
  shortcutClash,
  type Shortcut,
} from '../../shared/shortcuts.js';

const sc = (raw: string): Shortcut => {
  const parsed = parseShortcut(raw);
  assert.ok(parsed, raw);
  return parsed;
};

test('shortcuts round-trip in their canonical form', () => {
  for (const s of ['ctrl+shift+Space', 'alt+KeyD', 'F9', 'ctrl+alt+shift+meta+Period', 'shift+meta+KeyK']) {
    assert.equal(serializeShortcut(sc(s)), s);
  }
});

test('combinations that would type, or that the terminal or the number shortcuts use, are refused', () => {
  for (const s of ['Space', 'shift+KeyA', 'ctrl+KeyC', 'ctrl+Digit3', 'ctrl+shift+Digit1', 'ctrl+alt+shift+Digit9', 'shift+ctrl+Space', 'ctrl+ctrl+Space', 'hyper+Space', 'ctrl+Nope', '']) {
    assert.equal(parseShortcut(s), null, s);
  }
});

test('Cmd+K is a combination like any other, now that the search shortcut can change', () => {
  assert.equal(serializeShortcut(sc('meta+KeyK')), 'meta+KeyK');
});

test("each panel shortcut defaults to its Mac or other computer's combination", () => {
  const defaults = (mac: boolean) => Object.fromEntries(PANEL_SHORTCUTS.map((s) => [s.id, serializeShortcut(panelShortcut(s.id, undefined, mac))]));
  assert.deepEqual(defaults(true), { search: 'meta+KeyK', foldList: 'meta+KeyB', foldPads: 'meta+Period', quickNote: 'ctrl+alt+KeyN' });
  assert.deepEqual(defaults(false), { search: 'ctrl+shift+KeyK', foldList: 'ctrl+shift+KeyB', foldPads: 'ctrl+shift+Period', quickNote: 'ctrl+alt+KeyN' });
});

test('a saved panel shortcut wins over the default, unless it is not a valid combination', () => {
  assert.equal(serializeShortcut(panelShortcut('quickNote', 'shift+meta+KeyU', true)), 'shift+meta+KeyU');
  for (const saved of ['KeyU', 'ctrl+KeyU', 'basura', '']) assert.equal(serializeShortcut(panelShortcut('quickNote', saved, true)), 'ctrl+alt+KeyN', saved);
});

test('a key event matches a shortcut only with the same key and the same four modifiers', () => {
  const key = (code: string, mods: Partial<Record<'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey', boolean>> = {}) => ({
    code,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...mods,
  });
  const note = sc('ctrl+alt+KeyN');
  assert.equal(matchesShortcut(key('KeyN', { ctrlKey: true, altKey: true }), note), true);
  assert.equal(matchesShortcut(key('KeyN', { ctrlKey: true, altKey: true, shiftKey: true }), note), false);
  assert.equal(matchesShortcut(key('KeyN', { altKey: true }), note), false);
  assert.equal(matchesShortcut(key('KeyM', { ctrlKey: true, altKey: true }), note), false);
});

test('a combination another shortcut already uses is named, and a free one is not', () => {
  const taken = [
    { label: 'Plegar la lista', shortcut: sc('meta+KeyB') },
    { label: 'Dictado', shortcut: sc('ctrl+shift+Space') },
  ];
  assert.equal(shortcutClash(sc('meta+KeyB'), taken), 'Plegar la lista');
  assert.equal(shortcutClash(sc('ctrl+shift+Space'), taken), 'Dictado');
  assert.equal(shortcutClash(sc('shift+meta+KeyB'), taken), null);
});

test('a Mac writes shortcuts with its symbols in its order, other computers with names', () => {
  assert.equal(formatShortcut(sc('ctrl+alt+KeyN'), true), '⌃⌥N');
  assert.equal(formatShortcut(sc('meta+Period'), true), '⌘.');
  assert.equal(formatShortcut(sc('alt+meta+KeyD'), true), '⌥⌘D');
  assert.equal(formatShortcut(sc('ctrl+shift+Space'), true), '⌃⇧Espacio');
  assert.equal(formatShortcut(sc('ctrl+alt+KeyN'), false), 'Ctrl+Alt+N');
  assert.equal(formatShortcut(sc('ctrl+shift+Space'), false), 'Ctrl+Shift+Espacio');
  assert.equal(formatShortcut(sc('F9'), false), 'F9');
});
