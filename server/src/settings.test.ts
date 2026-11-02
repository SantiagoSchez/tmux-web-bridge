import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
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
