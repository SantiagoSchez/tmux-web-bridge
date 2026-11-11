import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TmuxError } from './exec.js';
import type { HostMonitor } from './host.js';
import { kitDir, kitScript, kitTag, trelloScript, updateKit } from './kit.js';

test('kitTag takes only plain X.Y.Z versions', () => {
  assert.equal(kitTag('1.2.3'), 'v1.2.3');
  assert.throws(() => kitTag(null), /No hay ninguna release/);
  assert.throws(() => kitTag(''), /No hay ninguna release/);
  for (const bad of ['v1.2.3', '1.2', '1.2.3-beta', '1.2.3; rm -rf ~', "1.2.3'", '1.2.3\n']) assert.throws(() => kitTag(bad), /inválida/, bad);
});

test('kitDir uses @twb_kit_dir, or ~/tmux-web-bridge for kits without it', () => {
  assert.equal(kitDir('/home/ana/tmux-web-bridge\n'), "'/home/ana/tmux-web-bridge'");
  assert.equal(kitDir("/Users/o'neil/twb"), `'/Users/o'\\''neil/twb'`);
  for (const none of [null, undefined, '', '\n', 'relative/path']) assert.equal(kitDir(none), '"$HOME"/tmux-web-bridge');
});

test('kitScript checks out the tag without hooks and then applies the kit', () => {
  const s = kitScript(kitDir(null), 'v1.1.0');
  assert.match(s, /^dir="\$HOME"\/tmux-web-bridge$/m);
  assert.match(s, /core\.hooksPath=\/dev\/null .*checkout --quiet 'v1\.1\.0'/);
  assert.ok(s.indexOf('git status --porcelain') < s.indexOf('git fetch'));
  assert.ok(s.indexOf('git remote get-url origin') < s.indexOf('git fetch'));
  assert.match(s, /TWB_NO_TMUX_RELOAD=1 host-kit\/install\.sh --quiet/);
});

test('kitScript asks a kit that knows it for the Trello extension, only when the machine has it on', () => {
  assert.match(kitScript(kitDir(null), 'v1.1.0'), /^trello=$/m);
  const on = kitScript(kitDir(null), 'v1.1.0', true);
  // An older install.sh refuses unknown options: the flag goes only to one that has it.
  assert.match(on, /^trello=; grep -q -- '--trello-extension\)' host-kit\/install\.sh && trello=--trello-extension$/m);
  assert.match(on, /install\.sh --quiet \$trello /);
  assert.ok(on.indexOf('trello=;') > on.indexOf('checkout --quiet'));
});

test('trelloScript turns it on or off without touching tmux or Claude Code, and says where it is', () => {
  const on = trelloScript(kitDir('/home/ana/twb'), true);
  assert.match(on, /^dir='\/home\/ana\/twb'$/m);
  assert.match(on, /anterior a la extensión de Trello/);
  assert.match(on, /install\.sh --quiet --skip-tmux --skip-claude --trello-extension /);
  assert.match(on, /TWB_TRELLO_DIR=/);
  const off = trelloScript(kitDir(null), false);
  assert.match(off, /--no-trello-extension /);
  assert.doesNotMatch(off, /TWB_TRELLO_DIR=/);
});

/** A host whose shell fails like `err` (tmux answers nothing: no @twb_kit_dir). */
function fakeHost(err: Error) {
  return {
    name: 'MacBook Air',
    exec: { run: async () => '', shell: async () => Promise.reject(err) },
  } as unknown as HostMonitor;
}

test('updateKit explains a machine that does not answer, and needs a known release', async () => {
  await assert.rejects(updateKit(fakeHost(new TmuxError('ssh: connect timed out', '', 255)), '1.1.0'), /^Error: MacBook Air no responde/);
  await assert.rejects(updateKit(fakeHost(new TmuxError('', '', 'timeout')), '1.1.0'), /no responde/);
  await assert.rejects(updateKit(fakeHost(new TmuxError('Cambios locales en el clon del kit (/x): no se toca', '', 1)), '1.1.0'), /^Error: MacBook Air: Cambios locales/);
  await assert.rejects(updateKit(fakeHost(new Error('unused')), null), /No hay ninguna release/);
});
