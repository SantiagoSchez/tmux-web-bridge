import assert from 'node:assert/strict';
import { test } from 'node:test';
import { modelLabel, screenWords } from './dictation.js';

test('screenWords keeps names, files and commands, newest line first, once each', () => {
  const screen = ['$ pnpm test', '● Read(web/src/components/TerminalView.tsx)', '  ⎿  keepFocus usa keyboardShown() y pnpm', '╰──────╯'].join('\n');
  assert.deepEqual(screenWords(screen), ['keepFocus', 'usa', 'keyboardShown', 'pnpm', 'Read', 'web/src/components/TerminalView.tsx', 'test']);
});

test('screenWords skips short words and box drawing, and stops at the limit', () => {
  assert.deepEqual(screenWords('│ a de la │ ── ✻ ok'), []);
  assert.deepEqual(screenWords('uno dos tres cuatro', 2), ['uno', 'dos']);
  assert.deepEqual(screenWords('Docker docker DOCKER'), ['Docker']);
});

test('modelLabel names the model whether llama-server got it with -hf or -m', () => {
  assert.equal(modelLabel('unsloth/Qwen3.5-4B-GGUF:Q4_K_M'), 'Qwen3.5-4B Q4_K_M');
  assert.equal(modelLabel('/models/Qwen3.5-4B-Q4_K_M.gguf'), 'Qwen3.5-4B Q4_K_M');
  assert.equal(modelLabel('mi-modelo'), 'mi-modelo');
});
