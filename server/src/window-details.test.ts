import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PaneInfo, SessionInfo, WindowInfo } from '../../shared/types.js';
import { spaceDetails, windowDetails } from '../../shared/window-details.js';

const HOME = '/home/ana';

function pane(over: Partial<PaneInfo>): PaneInfo {
  return { id: '%1', index: 0, active: true, command: 'zsh', path: `${HOME}/Proyectos/demo`, title: '', icon: '', state: null, width: 80, height: 24, left: 0, top: 0, dead: false, inMode: false, ...over };
}

function windowOf(over: Partial<WindowInfo>): WindowInfo {
  return { id: '@1', index: 1, name: 'shell', active: true, icon: '', state: null, pinned: false, bell: false, activity: false, zoomed: false, panes: [pane({})], ...over };
}

test('a Claude window in a worktree gives every detail in full, with no active mark for its only pane', () => {
  const worktree = 'feature-484-revisar-la-funcionalidad-de-busqueda';
  const w = windowOf({
    name: 'feat/484-revisar',
    icon: '🙋',
    state: 'question',
    panes: [pane({ command: 'claude', state: 'question', since: 1_000, path: `${HOME}/Proyectos/shop/.claude/worktrees/${worktree}`, git: { worktree }, account: 'ana@example.com' })],
  });
  assert.deepEqual(windowDetails(w, { home: HOME }), {
    name: 'feat/484-revisar',
    state: { icon: '🙋', label: 'Pregunta', since: 1_000 },
    panes: [{ index: 0, active: false, marked: false, command: 'claude', place: { kind: 'worktree', name: worktree }, path: `~/Proyectos/shop/.claude/worktrees/${worktree}`, account: 'ana@example.com' }],
  });
});

test('a window with two panes lists both in order and marks the active one', () => {
  const w = windowOf({
    name: 'api',
    panes: [
      pane({ id: '%1', index: 0, active: true, command: 'claude', path: `${HOME}/Proyectos/backend`, git: { branch: 'main' } }),
      pane({ id: '%2', index: 1, active: false, command: 'zsh', path: `${HOME}/Proyectos/backend/web` }),
    ],
  });
  const d = windowDetails(w, { home: HOME });
  assert.deepEqual(
    d.panes.map((p) => [p.index, p.active, p.command, p.place, p.path]),
    [
      [0, true, 'claude', { kind: 'branch', name: 'main' }, '~/Proyectos/backend'],
      [1, false, 'zsh', undefined, '~/Proyectos/backend/web'],
    ],
  );
});

test('a pane in a repository with active changes lists each one by its full name, with what is known of it', () => {
  const name = 'show-progress-of-openspec-changes';
  const w = windowOf({
    panes: [
      pane({
        changes: [
          { name: 'add-export', path: '/srv/shop/openspec/changes/add-export', proposal: true },
          { name, path: `/srv/shop/openspec/changes/${name}`, proposal: true, tasks: { done: 7, total: 23 }, review: { pr: 74, round: { n: 2, of: 3 }, blockers: 1 } },
        ],
      }),
    ],
  });
  assert.deepEqual(windowDetails(w, { home: HOME }).panes[0].changes, [
    { name: 'add-export', facts: [] },
    { name, facts: ['7/23 (30 %)', 'PR #74', 'ronda 2/3', '1 bloqueante'] },
  ]);
});

test('a window with nothing to say leaves out the state, the place, the account and the machine', () => {
  const d = windowDetails(windowOf({ name: 'shell', panes: [pane({ path: '/srv/data' })] }), { home: HOME });
  assert.deepEqual(d, { name: 'shell', panes: [{ index: 0, active: false, marked: false, command: 'zsh', path: '/srv/data' }] });
});

test('the state takes the time of the pane that has it, and the machine shows only when asked', () => {
  const w = windowOf({
    icon: '✅',
    state: 'done',
    panes: [pane({ id: '%1', index: 0, state: 'busy', since: 5 }), pane({ id: '%2', index: 1, active: false, state: 'done', since: 9 })],
  });
  assert.deepEqual(windowDetails(w, { home: HOME }).state, { icon: '✅', label: 'Terminado', since: 9 });
  assert.equal(windowDetails(w, { home: HOME }).host, undefined);
  assert.equal(windowDetails(w, { home: HOME, hostName: 'Mac' }).host, 'Mac');
});

test('a pane can be marked, as the rail does for the pane it shows', () => {
  const w = windowOf({ panes: [pane({ id: '%1', index: 0 }), pane({ id: '%2', index: 1, active: false })] });
  assert.deepEqual(
    windowDetails(w, { home: HOME, mark: '%2' }).panes.map((p) => p.marked),
    [false, true],
  );
});

test('a space gives its full name and how many windows it has', () => {
  const s: SessionInfo = { id: '$1', name: 'shop-platform', created: 0, num: 4, icon: '', attached: 0, windows: [windowOf({}), windowOf({ id: '@2' }), windowOf({ id: '@3' })] };
  assert.deepEqual(spaceDetails(s), { name: 'shop-platform', windows: 3 });
});
