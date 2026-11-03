import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PaneInfo, PaneState, SessionInfo, WindowInfo } from '../../shared/types.js';
import { rollUpStates } from './host.js';

const ICONS: Record<PaneState, string> = { question: '🙋', attention: '💬', done: '✅', busy: '🔨', claude: '🤖', ssh: '📡' };

function pane(state: PaneState | null): PaneInfo {
  return { id: '%1', index: 0, active: true, command: 'claude', path: '/', title: '', icon: state ? ICONS[state] : '', state, width: 80, height: 24, dead: false, inMode: false };
}

function win(states: (PaneState | null)[], stale: PaneState | null = null): WindowInfo {
  return { id: '@1', index: 0, name: 'w', active: true, icon: stale ? ICONS[stale] : '', state: stale, pinned: false, bell: false, activity: false, zoomed: false, panes: states.map(pane) };
}

function space(windows: WindowInfo[], stale = ''): SessionInfo {
  return { id: '$1', name: 's', num: 1, icon: stale, attached: 0, windows };
}

test('a window and its space take the most urgent state of their panes, whatever tmux left behind', () => {
  const s = space([win(['claude', 'busy'], 'claude'), win(['question'], 'busy'), win([null], 'done')], '🔨');
  rollUpStates([s]);
  assert.deepEqual(
    s.windows.map((w) => [w.state, w.icon]),
    [
      ['busy', '🔨'],
      ['question', '🙋'],
      [null, ''],
    ],
  );
  assert.equal(s.icon, '🙋');
});

test('a space with nothing going on has no icon', () => {
  const s = space([win([null, null])], '🤖');
  rollUpStates([s]);
  assert.equal(s.icon, '');
  assert.equal(s.windows[0].state, null);
});
