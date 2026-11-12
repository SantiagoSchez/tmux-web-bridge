import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { describeSchedule, nextRun, parseCron, scheduleProblem, type Schedule } from '../../shared/schedule.js';
import type { Automation, ExtLaunchResult, PaneState } from '../../shared/types.js';
import { Automations } from './automations.js';

const at = (s: string) => new Date(s);
const next = (s: Schedule, from: string) => nextRun(s, at(from))?.toString().slice(0, 21);

test('days: the next of those days at that time, today if it is still to come', () => {
  const workdays: Schedule = { kind: 'days', days: [1, 2, 3, 4, 5], time: '09:30' };
  // 2026-11-12 is a Thursday.
  assert.equal(next(workdays, '2026-11-12T08:00:00'), at('2026-11-12T09:30:00').toString().slice(0, 21));
  assert.equal(next(workdays, '2026-11-12T09:30:00'), at('2026-11-13T09:30:00').toString().slice(0, 21));
  assert.equal(next(workdays, '2026-11-13T10:00:00'), at('2026-11-16T09:30:00').toString().slice(0, 21));
});

test('every n hours: from midnight, at the minute chosen', () => {
  const s: Schedule = { kind: 'every', hours: 6, minute: 15 };
  assert.equal(next(s, '2026-11-12T06:15:00'), at('2026-11-12T12:15:00').toString().slice(0, 21));
  assert.equal(next(s, '2026-11-12T19:00:00'), at('2026-11-13T00:15:00').toString().slice(0, 21));
});

test('cron: lists, ranges, steps, Sunday as 0 or 7, and either day field when both are set', () => {
  assert.equal(next({ kind: 'cron', expr: '0 18 * * 1-5' }, '2026-11-14T10:00:00'), at('2026-11-16T18:00:00').toString().slice(0, 21));
  assert.equal(next({ kind: 'cron', expr: '*/20 * * * *' }, '2026-11-12T10:41:00'), at('2026-11-12T11:00:00').toString().slice(0, 21));
  assert.equal(next({ kind: 'cron', expr: '0 3 * * 7' }, '2026-11-12T00:00:00'), at('2026-11-15T03:00:00').toString().slice(0, 21));
  // The 1st of the month, or any Monday: Monday the 16th comes first.
  assert.equal(next({ kind: 'cron', expr: '0 8 1 * 1' }, '2026-11-13T00:00:00'), at('2026-11-16T08:00:00').toString().slice(0, 21));
  assert.equal(nextRun({ kind: 'cron', expr: '0 0 31 2 *' }, at('2026-11-12T00:00:00')), null);
  assert.throws(() => parseCron('0 18 * *'), /5 campos/);
  assert.throws(() => parseCron('61 * * * *'), /se sale/);
});

test('schedules are checked and described in words', () => {
  assert.equal(scheduleProblem({ kind: 'days', days: [], time: '09:00' }), 'Elige al menos un día');
  assert.equal(scheduleProblem({ kind: 'days', days: [1], time: '9:00' }), 'La hora tiene que ser HH:MM');
  assert.ok(scheduleProblem({ kind: 'every', hours: 5, minute: 0 }));
  assert.ok(scheduleProblem({ kind: 'cron', expr: 'x' }));
  assert.equal(describeSchedule({ kind: 'days', days: [0, 1, 2, 3, 4, 5, 6], time: '18:00' }), 'Cada día a las 18:00');
  assert.equal(describeSchedule({ kind: 'days', days: [5, 1, 2, 3, 4], time: '09:30' }), 'Laborables a las 09:30');
  assert.equal(describeSchedule({ kind: 'days', days: [0, 1, 4], time: '08:00' }), 'Lunes, jueves y domingo a las 08:00');
  assert.equal(describeSchedule({ kind: 'every', hours: 6, minute: 0 }), 'Cada 6 h, en punto');
});

// ---------------------------------------------------------------- the scheduler

const base = {
  name: 'Deps nocturnas',
  host: 'mac',
  target: { folder: '~/Proyectos', sub: 'twb' },
  prompt: 'Sube las dependencias',
  worktree: true,
  skipPermissions: false,
  schedule: { kind: 'days', days: [0, 1, 2, 3, 4, 5, 6], time: '18:00' } as Schedule,
};

function setup(dir: string, clock: { now: Date }, panes: Map<string, PaneState | null>, fail?: string) {
  const launched: { a: Automation; worktree?: string }[] = [];
  let n = 0;
  const auto = new Automations(dir, {
    now: () => clock.now,
    paneState: (_h, pane) => (panes.has(pane) ? panes.get(pane) : undefined),
    launch: async (a, worktree) => {
      if (fail) throw new Error(fail);
      launched.push({ a, worktree });
      const pane = `%${++n}`;
      panes.set(pane, 'busy');
      return { host: 'mac', hostName: 'Mac', session: '$1', space: 'twb', window: `@${n}`, windowName: 'x', pane, createdSpace: false } satisfies ExtLaunchResult;
    },
  });
  return { auto, launched };
}

function withDir(fn: (dir: string) => Promise<void>): () => Promise<void> {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), 'twb-auto-'));
    try {
      await fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

test(
  'it runs when its time comes, once, in a worktree named after it and the date, and plans the next one',
  withDir(async (dir) => {
    const clock = { now: at('2026-11-12T17:00:00') };
    const { auto, launched } = setup(dir, clock, new Map());
    const a = auto.upsert(base);
    assert.equal(a.nextRun, at('2026-11-12T18:00:00').getTime());
    await auto.tick();
    assert.equal(launched.length, 0);
    clock.now = at('2026-11-12T18:00:10');
    await auto.tick();
    await auto.tick();
    assert.equal(launched.length, 1);
    assert.equal(launched[0].worktree, 'deps-nocturnas-20261112-1800');
    const info = auto.info[0];
    assert.equal(info.nextRun, at('2026-11-13T18:00:00').getTime());
    assert.equal(info.runs[0].status, 'launched');
    assert.equal(info.runs[0].pane, '%1');
  }),
);

test(
  'a run is skipped while the previous one is still at it, and goes ahead once it is done or gone',
  withDir(async (dir) => {
    const clock = { now: at('2026-11-12T10:00:00') };
    const panes = new Map<string, PaneState | null>();
    const { auto, launched } = setup(dir, clock, panes);
    const { id } = auto.upsert(base);
    assert.equal((await auto.runNow(id)).status, 'launched');
    const skipped = await auto.runNow(id);
    assert.equal(skipped.status, 'skipped');
    assert.match(skipped.message ?? '', /seguía trabajando/);
    panes.set('%1', 'question');
    assert.equal((await auto.runNow(id)).status, 'skipped');
    panes.set('%1', 'done');
    assert.equal((await auto.runNow(id)).status, 'launched');
    panes.delete('%2');
    assert.equal((await auto.runNow(id)).status, 'launched');
    assert.equal(launched.length, 3);
  }),
);

test(
  'a launch that fails is a run with its error; changes are kept across a restart, and disabled ones do not run',
  withDir(async (dir) => {
    const clock = { now: at('2026-11-12T10:00:00') };
    const { auto } = setup(dir, clock, new Map(), 'Mac no está conectada');
    const runs: string[] = [];
    auto.on('run', (_a, r) => runs.push(r.status));
    const { id } = auto.upsert({ ...base, worktree: false });
    const run = await auto.runNow(id);
    assert.deepEqual([run.status, run.message], ['error', 'Mac no está conectada']);
    assert.deepEqual(runs, ['error']);
    auto.upsert({ ...base, id, enabled: false });
    const again = setup(dir, clock, new Map());
    assert.equal(again.auto.info[0].enabled, false);
    assert.equal(again.auto.info[0].nextRun, null);
    assert.equal(again.auto.info[0].runs.length, 1);
    clock.now = at('2026-11-12T18:00:30');
    await again.auto.tick();
    assert.equal(again.launched.length, 0);
    assert.throws(() => again.auto.upsert({ ...base, prompt: ' ' }), /Falta el prompt/);
    assert.throws(() => again.auto.upsert({ ...base, schedule: { kind: 'cron', expr: 'nada' } }), /5 campos/);
    again.auto.remove(id);
    assert.equal(again.auto.info.length, 0);
  }),
);
