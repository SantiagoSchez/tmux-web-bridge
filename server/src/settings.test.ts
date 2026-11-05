import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULT_KEYBAR, type KeybarButton } from '../../shared/keybar.js';
import { DEFAULT_GLOSSARY, SettingsStore } from './settings.js';

function withDir(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'twb-settings-'));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('a new hub starts with the default glossary and 10 s for the cleanup', () =>
  withDir((dir) => {
    const s = new SettingsStore(dir).value;
    assert.equal(s.dictationGlossary, DEFAULT_GLOSSARY);
    assert.equal(s.dictationTimeout, 10);
  }));

test('an empty glossary from before gets the default once, and can be emptied again', () =>
  withDir((dir) => {
    const file = join(dir, 'settings.json');
    writeFileSync(file, JSON.stringify({ limitsInStatusLine: false, dictation: true, dictationCleanup: 'llm', dictationGlossary: '' }));
    const store = new SettingsStore(dir);
    assert.equal(store.value.dictationGlossary, DEFAULT_GLOSSARY);
    assert.equal(store.value.limitsInStatusLine, false);
    assert.equal('dictationGlossarySeeded' in store.value, false);

    store.update({ dictationGlossary: '' });
    assert.equal(new SettingsStore(dir).value.dictationGlossary, '');
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).dictationGlossarySeeded, true);
  }));

test('a glossary already written is kept as it is', () =>
  withDir((dir) => {
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ dictationGlossary: 'mi-proyecto' }));
    assert.equal(new SettingsStore(dir).value.dictationGlossary, 'mi-proyecto');
  }));

test('only the offered cleanup timeouts are accepted', () =>
  withDir((dir) => {
    const store = new SettingsStore(dir);
    store.update({ dictationTimeout: 20 });
    assert.equal(store.value.dictationTimeout, 20);
    store.update({ dictationTimeout: 7 });
    store.update({ dictationTimeout: '30' as unknown as number });
    assert.equal(store.value.dictationTimeout, 20);
  }));

test('single-window spaces fold into one row unless turned off', () =>
  withDir((dir) => {
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ limitsInStatusLine: true }));
    const store = new SettingsStore(dir);
    assert.equal(store.value.soloSpaces, true);
    store.update({ soloSpaces: false });
    store.update({ soloSpaces: 'yes' as unknown as boolean });
    assert.equal(new SettingsStore(dir).value.soloSpaces, false);
  }));

test('the dictation button holds by default, and the shortcut keeps only valid combinations', () =>
  withDir((dir) => {
    const store = new SettingsStore(dir);
    assert.equal(store.value.dictationButton, 'hold');
    assert.equal(store.value.dictationShortcut, 'ctrl+shift+Space');
    store.update({ dictationButton: 'toggle', dictationShortcut: 'alt+KeyD' });
    store.update({ dictationButton: 'press' as unknown as 'hold', dictationShortcut: 'KeyD' });
    store.update({ dictationShortcut: 'ctrl+KeyC' });
    const saved = new SettingsStore(dir).value;
    assert.equal(saved.dictationButton, 'toggle');
    assert.equal(saved.dictationShortcut, 'alt+KeyD');
  }));

test('the key bar starts as it always was, and keeps only well-formed buttons', () =>
  withDir((dir) => {
    const store = new SettingsStore(dir);
    assert.deepEqual(store.value.keybar, DEFAULT_KEYBAR);
    store.update({
      keybar: [
        { kind: 'text', label: 'clear', text: '/clear', enter: true },
        { kind: 'key', label: '', key: 'd', ctrl: true },
        { kind: 'key', label: '', key: 'nope' },
        { kind: 'text', label: 'vacío', text: '' },
        { kind: 'bogus', label: 'x' } as unknown as KeybarButton,
        { kind: 'mic', label: '' },
      ],
    });
    store.update({ keybar: 'nope' as unknown as KeybarButton[] });
    assert.deepEqual(new SettingsStore(dir).value.keybar, [
      { kind: 'text', label: 'clear', text: '/clear', enter: true },
      { kind: 'key', label: '', key: 'd', ctrl: true },
      { kind: 'mic', label: '' },
    ]);
    store.update({ keybar: [] });
    assert.deepEqual(new SettingsStore(dir).value.keybar, []);
  }));

test('a broken key bar in the file falls back to the default one', () =>
  withDir((dir) => {
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ keybar: { up: true } }));
    assert.deepEqual(new SettingsStore(dir).value.keybar, DEFAULT_KEYBAR);
  }));

test('folders: a patch replaces the lists of the hosts it names and keeps the rest', () =>
  withDir((dir) => {
    const store = new SettingsStore(dir);
    assert.deepEqual(store.value.folders, {});
    store.update({ folders: { mac: [{ name: 'twb', path: '~/Proyectos/twb/' }], dev: [{ name: 'x', path: '/srv/x' }] } });
    store.update({ folders: { dev: [] } });
    assert.deepEqual(new SettingsStore(dir).value.folders, { mac: [{ name: 'twb', path: '~/Proyectos/twb' }] });
  }));

test('folders: invalid entries and repeated names are dropped', () =>
  withDir((dir) => {
    const store = new SettingsStore(dir);
    store.update({
      folders: {
        mac: [
          { name: ' a ', path: '~' },
          { name: 'a', path: '/otra' },
          { name: '.oculta', path: '/x' },
          { name: 'b/c', path: '/x' },
          { name: 'rel', path: 'relativa' },
          { name: 'raro', path: '~usuario/x' },
          { name: 'ok', path: '/' },
        ],
        bad: 'nope',
      } as never,
    });
    assert.deepEqual(store.value.folders, { mac: [{ name: 'a', path: '~' }, { name: 'ok', path: '/' }] });
  }));
