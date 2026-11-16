import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_DICTATION_SHORTCUT, dictationShortcutOf } from '../../shared/dictation.js';
import {
  formatShortcut,
  matchesShortcut,
  PANEL_SHORTCUT_IDS,
  panelShortcut,
  parseShortcut,
  serializeShortcut,
  shortcutClash,
  shortcutRefusal,
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
  const defaults = (mac: boolean) => Object.fromEntries(PANEL_SHORTCUT_IDS.map((id) => [id, serializeShortcut(panelShortcut(id, undefined, mac))]));
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

test("the defaults of each kind of device are valid and clash neither with each other nor with the dictation's", () => {
  for (const mac of [true, false]) {
    const all = [...PANEL_SHORTCUT_IDS.map((id) => serializeShortcut(panelShortcut(id, undefined, mac))), DEFAULT_DICTATION_SHORTCUT];
    for (const s of all) assert.ok(parseShortcut(s), s);
    assert.equal(new Set(all).size, all.length, all.join(' '));
  }
});

test('a change or a «Restablecer» is refused with its reason when the combination cannot be set', () => {
  const taken = [{ label: 'Nota rápida', shortcut: sc('meta+KeyB') }];
  // «Restablecer» on fold the list after the quick note took its default ⌘B.
  assert.equal(shortcutRefusal(sc('meta+KeyB'), taken), 'ya es «Nota rápida».');
  assert.match(shortcutRefusal({ ctrl: false, alt: false, shift: true, meta: false, code: 'KeyN' }, taken) ?? '', /se escribiría en el terminal/);
  assert.match(shortcutRefusal({ ctrl: false, alt: false, shift: false, meta: true, code: 'Escape' }, taken) ?? '', /no se puede usar/);
  assert.equal(shortcutRefusal(sc('meta+KeyJ'), taken), null);
});

test("Alt with only 1 to 5 is refused: it chooses the quick note's colour", () => {
  for (const d of [1, 2, 5]) {
    const alt = { ctrl: false, alt: true, shift: false, meta: false, code: `Digit${d}` };
    assert.equal(parseShortcut(`alt+Digit${d}`), null);
    assert.match(shortcutRefusal(alt, []) ?? '', /color/);
  }
  for (const s of ['alt+Digit6', 'alt+shift+Digit1', 'alt+meta+Digit2']) assert.ok(parseShortcut(s), s);
});

test("the dictation shortcut is the hub's when valid, else the default", () => {
  assert.equal(serializeShortcut(dictationShortcutOf('ctrl+shift+KeyD')), 'ctrl+shift+KeyD');
  for (const raw of [undefined, '', 'ctrl+KeyD', 'basura']) assert.equal(serializeShortcut(dictationShortcutOf(raw)), DEFAULT_DICTATION_SHORTCUT, String(raw));
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
