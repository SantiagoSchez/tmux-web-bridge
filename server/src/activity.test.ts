import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { PaneState } from '../../shared/types.js';
import { ActivityLog } from './activity.js';
import type { PaneTransition } from './host.js';

function transition(from: PaneState | null, to: PaneState | null, pane = '%1'): PaneTransition {
  return {
    host: { id: 'mac', name: 'Mac' },
    session: { id: '$1', name: 'twb' },
    window: { id: '@2', name: 'login' },
    pane: { id: pane },
    from,
    to,
  } as unknown as PaneTransition;
}

function withDir(fn: (dir: string) => void): () => void {
  return () => {
    const dir = mkdtempSync(join(tmpdir(), 'twb-activity-'));
    try {
      fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

test(
  'a Claude that works, asks, works again and finishes: two events, and the whole turn as its work time',
  withDir((dir) => {
    let now = 1_000_000;
    const log = new ActivityLog(dir, () => now);
    log.onTransition(transition('claude', 'busy'));
    now += 60_000;
    log.onTransition(transition('busy', 'question'));
    log.onTransition(transition('question', 'attention'));
    now += 30_000;
    log.onTransition(transition('attention', 'busy'));
    now += 90_000;
    log.onTransition(transition('busy', 'done'));
    const [done, question] = log.list;
    assert.equal(log.list.length, 2);
    assert.deepEqual([question.kind, done.kind], ['question', 'done']);
    assert.equal(done.worked, 180_000);
    assert.equal(done.windowName, 'login');
    assert.equal(done.space, 'twb');
  }),
);

test(
  'events last a week, survive a restart, and launches are events too',
  withDir((dir) => {
    let now = 10 * 86_400_000;
    const log = new ActivityLog(dir, () => now);
    log.add({ kind: 'launch', source: 'trello', host: 'mac', hostName: 'Mac', text: '3-login' });
    now += 6 * 86_400_000;
    log.add({ kind: 'error', source: 'automation', host: 'mac', hostName: 'Mac', text: 'Deps: sin conexión' });
    log.save();
    const again = new ActivityLog(dir, () => now);
    assert.deepEqual(
      again.list.map((e) => e.kind),
      ['error', 'launch'],
    );
    now += 2 * 86_400_000;
    assert.deepEqual(
      again.list.map((e) => e.kind),
      ['error'],
    );
    assert.equal(again.add({ kind: 'done', host: 'mac', hostName: 'Mac' }).id, 3);
  }),
);
