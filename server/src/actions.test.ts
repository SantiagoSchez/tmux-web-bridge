import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectCommand } from './actions.js';

test('a claude projects command gets the permission mode chosen', () => {
  assert.equal(projectCommand('claude', false), 'claude --permission-mode auto');
  assert.equal(projectCommand('claude', true), 'claude --dangerously-skip-permissions');
  assert.equal(projectCommand('~/.local/bin/claude --model opus', true), '~/.local/bin/claude --model opus --dangerously-skip-permissions');
});

test('any other projects command is typed as is', () => {
  assert.equal(projectCommand('nvim .', true), 'nvim .');
  assert.equal(projectCommand('claudette', false), 'claudette');
});
