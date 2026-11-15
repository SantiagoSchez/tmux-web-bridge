import assert from 'node:assert/strict';
import { test } from 'node:test';
import { paneAt } from '../../shared/panes.js';
import type { PaneInfo, WindowInfo } from '../../shared/types.js';

/** A window of panes at [left, top, width, height]; the first one is the active one. */
function win(rects: [number, number, number, number][], zoomed = false): WindowInfo {
  const panes = rects.map(([left, top, width, height], i): PaneInfo => ({
    id: `%${i}`, index: i, active: i === 0, command: 'zsh', path: `/p${i}`, title: '', icon: '', state: null,
    width, height, left, top, dead: false, inMode: false,
  }));
  return { id: '@1', index: 0, name: 'w', active: true, icon: '', state: null, pinned: false, bell: false, activity: false, zoomed, panes };
}

const id = (w: WindowInfo, col: number, row: number, cols = 80, rows = 24) => paneAt(w, col, row, cols, rows)?.id;

test('side by side: the pane left or right of the border', () => {
  // tmux leaves column 40 for the border.
  const w = win([[0, 0, 40, 24], [41, 0, 39, 24]]);
  assert.equal(id(w, 0, 0), '%0');
  assert.equal(id(w, 39, 23), '%0');
  assert.equal(id(w, 41, 0), '%1');
  assert.equal(id(w, 79, 12), '%1');
});

test('one on top of the other: the pane above or below the border', () => {
  const w = win([[0, 0, 80, 12], [0, 13, 80, 11]]);
  assert.equal(id(w, 10, 11), '%0');
  assert.equal(id(w, 10, 13), '%1');
});

test('nothing on a border', () => {
  const w = win([[0, 0, 40, 24], [41, 0, 39, 24]]);
  assert.equal(id(w, 40, 5), undefined);
});

test('a zoomed window shows only its active pane, wherever the cell is', () => {
  // While zoomed, the active pane takes the whole window; the others keep their old place.
  const w = win([[0, 0, 80, 24], [41, 0, 39, 24]], true);
  w.panes.reverse();
  assert.equal(id(w, 60, 5), '%0');
});

test('nothing when the window does not fit in the terminal', () => {
  // tmux then shows part of it at an offset the panel does not know.
  const w = win([[0, 0, 100, 24], [0, 25, 100, 10]]);
  assert.equal(id(w, 10, 5), undefined);
  assert.equal(id(win([[0, 0, 80, 30]]), 10, 5), undefined);
});

test('a window smaller than the terminal sits at its top left corner', () => {
  const w = win([[0, 0, 30, 10], [31, 0, 29, 10]]);
  assert.equal(id(w, 35, 2), '%1');
  assert.equal(id(w, 35, 15), undefined);
});
