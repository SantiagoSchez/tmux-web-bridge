import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tipPosition } from '../../shared/tip-position.js';

const VIEW = { width: 1200, height: 800 };

test('a tip that fits goes 8 px right of what it describes, level with its top', () => {
  const anchor = { left: 0, top: 100, right: 300, bottom: 150 };
  assert.deepEqual(tipPosition(anchor, { width: 250, height: 120 }, VIEW), { left: 308, top: 100 });
});

test('a tip with no room on the right goes on the left', () => {
  const anchor = { left: 900, top: 100, right: 1150, bottom: 150 };
  assert.deepEqual(tipPosition(anchor, { width: 250, height: 120 }, VIEW), { left: 642, top: 100 });
});

test('a tip with no room on either side stays 8 px inside the right edge', () => {
  const anchor = { left: 100, top: 100, right: 1100, bottom: 150 };
  assert.deepEqual(tipPosition(anchor, { width: 400, height: 120 }, VIEW), { left: 792, top: 100 });
});

test('a tip near the bottom moves up to stay 8 px inside the screen', () => {
  const anchor = { left: 0, top: 760, right: 300, bottom: 800 };
  assert.deepEqual(tipPosition(anchor, { width: 250, height: 200 }, VIEW), { left: 308, top: 592 });
});

test('a tip taller than the screen starts 8 px from its top', () => {
  const anchor = { left: 0, top: 400, right: 300, bottom: 450 };
  assert.deepEqual(tipPosition(anchor, { width: 250, height: 900 }, VIEW), { left: 308, top: 8 });
});
