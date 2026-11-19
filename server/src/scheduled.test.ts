import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { ExtLaunchRequest, ExtLaunchResult, ScheduledMessage, ScheduledMessageInput } from '../../shared/types.js';
import { ScheduledMessages, type ScheduledDeps } from './scheduled.js';

const at = (s: string) => new Date(s);
const ms = (s: string) => at(s).getTime();
const DAY = 86_400_000;

const base: ScheduledMessageInput = {
  name: 'Repasar tests',
  host: 'drangleic',
  target: { folder: '~/Proyectos/twb' },
  prompt: 'Repasa los tests que fallan',
  worktree: false,
  skipPermissions: false,
  at: ms('2026-11-20T10:00:00'),
};

interface Rig {
  store: ScheduledMessages;
  launched: Omit<ExtLaunchRequest, 'host'>[];
  runs: ScheduledMessage[];
}

/** A store over `dir` with a fake clock, a fake launch (failing with `fail`, or held until `hold` resolves) and a check that knows one machine and folder. */
function setup(dir: string, clock: { now: Date }, opts: { fail?: string; hold?: Promise<void> } = {}): Rig {
  const launched: Omit<ExtLaunchRequest, 'host'>[] = [];
  const runs: ScheduledMessage[] = [];
  let n = 0;
  const deps: ScheduledDeps = {
    now: () => clock.now,
    check: (host, target) => (host !== 'drangleic' ? `No existe la máquina «${host}»` : target.folder !== '~/Proyectos/twb' ? 'Esa carpeta no está entre las de drangleic' : null),
    launch: async (_m, req) => {
      launched.push(req);
      if (opts.hold) await opts.hold;
      if (opts.fail) throw new Error(opts.fail);
      n++;
      return { host: 'drangleic', hostName: 'Drangleic', session: '$1', space: 'twb', window: `@${n}`, windowName: req.name ?? '', pane: `%${n}`, createdSpace: false } satisfies ExtLaunchResult;
    },
  };
  const store = new ScheduledMessages(dir, deps);
  store.on('run', (m: ScheduledMessage) => runs.push(m));
  return { store, launched, runs };
}

function withDir(fn: (dir: string) => Promise<void>): () => Promise<void> {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), 'twb-scheduled-'));
    try {
      await fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

// ---------------------------------------------------------------- launching

test(
  'a message launches once when its time comes, with its options, and records its window',
  withDir(async (dir) => {
    const clock = { now: at('2026-11-20T09:00:00') };
    const { store, launched, runs } = setup(dir, clock);
    const { id } = store.upsert({ ...base, skipPermissions: true });
    await store.tick();
    assert.equal(launched.length, 0);
    clock.now = at('2026-11-20T10:00:15');
    await store.tick();
    await store.tick();
    assert.deepEqual(launched, [{ target: base.target, prompt: base.prompt, name: 'Repasar tests', skipPermissions: true }]);
    const m = store.list.find((x) => x.id === id)!;
    assert.equal(m.status, 'launched');
    assert.equal(m.ranAt, clock.now.getTime());
    assert.deepEqual([m.session, m.window, m.pane], ['$1', '@1', '%1']);
    assert.equal(m.late, undefined);
    assert.deepEqual(runs.map((r) => r.status), ['launched']);
  }),
);

test(
  'a message with a worktree launches in one named after it and its planned time, from its base',
  withDir(async (dir) => {
    const clock = { now: at('2026-11-20T09:00:00') };
    const { store, launched } = setup(dir, clock);
    store.upsert({ ...base, name: 'Limpieza', worktree: true, base: 'master', at: ms('2026-11-20T18:30:00') });
    clock.now = at('2026-11-20T18:30:40');
    await store.tick();
    const worktree = 'limpieza-20261120-1830';
    assert.deepEqual(launched, [{ target: base.target, prompt: base.prompt, name: worktree, worktree, base: 'master', skipPermissions: false }]);
    assert.equal(store.list[0].worktreeName, worktree);
  }),
);

test(
  'a message whose time passed while the hub was stopped launches on the first check, marked late',
  withDir(async (dir) => {
    const clock = { now: at('2026-11-20T09:00:00') };
    setup(dir, clock).store.upsert(base);
    clock.now = at('2026-11-20T11:30:00');
    const { store, launched } = setup(dir, clock);
    await store.tick();
    assert.equal(launched.length, 1);
    assert.equal(store.list[0].status, 'launched');
    assert.equal(store.list[0].late, true);
    assert.equal(store.list[0].at, base.at);
  }),
);

test(
  'a message launched on the check right after its time is not late',
  withDir(async (dir) => {
    const clock = { now: at('2026-11-20T09:00:00') };
    const { store } = setup(dir, clock);
    store.upsert(base);
    clock.now = at('2026-11-20T10:00:19');
    await store.tick();
    assert.equal(store.list[0].late, undefined);
  }),
);

test(
  'a message the hub was launching when it stopped becomes an error and is not launched again',
  withDir(async (dir) => {
    const clock = { now: at('2026-11-20T09:00:00') };
    setup(dir, clock).store.upsert(base);
    const file = join(dir, 'scheduled.json');
    const saved = JSON.parse(readFileSync(file, 'utf8')) as { list: ScheduledMessage[] };
    saved.list[0].status = 'launching';
    writeFileSync(file, JSON.stringify(saved));
    clock.now = at('2026-11-20T10:05:00');
    const { store, launched } = setup(dir, clock);
    await store.tick();
    assert.equal(launched.length, 0);
    assert.equal(store.list[0].status, 'error');
    assert.equal(store.list[0].message, 'El hub se reinició mientras lo lanzaba');
    assert.equal(store.list[0].ranAt, clock.now.getTime());
  }),
);

test(
  'a check that runs while a slow launch is in progress does not launch it again',
  withDir(async (dir) => {
    const clock = { now: at('2026-11-20T09:00:00') };
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    const { store, launched } = setup(dir, clock, { hold });
    store.upsert(base);
    clock.now = at('2026-11-20T10:00:05');
    const first = store.tick();
    assert.equal(store.list[0].status, 'launching');
    assert.equal(JSON.parse(readFileSync(join(dir, 'scheduled.json'), 'utf8')).list[0].status, 'launching');
    clock.now = at('2026-11-20T10:00:25');
    await store.tick();
    release();
    await first;
    assert.equal(launched.length, 1);
    assert.equal(store.list[0].status, 'launched');
  }),
);

test(
  'a due message moved while another one launches is launched at its new time, not with the old one',
  withDir(async (dir) => {
    const clock = { now: at('2026-11-20T09:00:00') };
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    const { store, launched } = setup(dir, clock, { hold });
    store.upsert({ ...base, name: 'Primero' });
    const second = store.upsert({ ...base, name: 'Segundo' });
    clock.now = at('2026-11-20T10:00:05');
    const running = store.tick();
    store.upsert({ ...base, id: second.id, name: 'Segundo', at: ms('2026-11-20T12:00:00') });
    release();
    await running;
    assert.deepEqual(launched.map((r) => r.name), ['Primero']);
    assert.equal(store.list.find((m) => m.id === second.id)?.status, 'pending');
  }),
);

test(
  'a launch that fails leaves the error in the message and tells who listens',
  withDir(async (dir) => {
    const clock = { now: at('2026-11-20T09:00:00') };
    const { store, runs } = setup(dir, clock, { fail: 'Drangleic no está conectada' });
    store.upsert(base);
    clock.now = at('2026-11-20T10:00:05');
    await store.tick();
    assert.deepEqual([store.list[0].status, store.list[0].message], ['error', 'Drangleic no está conectada']);
    assert.deepEqual(runs.map((r) => [r.status, r.message]), [['error', 'Drangleic no está conectada']]);
  }),
);

test(
  'results leave the list 7 days after they ran; younger ones and pending ones stay',
  withDir(async (dir) => {
    const clock = { now: at('2026-11-20T09:00:00') };
    const { store } = setup(dir, clock);
    const old = store.upsert({ ...base, name: 'Vieja' });
    const young = store.upsert({ ...base, name: 'Joven', at: ms('2026-11-21T10:00:00') });
    const pending = store.upsert({ ...base, name: 'Pendiente', at: ms('2026-12-20T10:00:00') });
    clock.now = at('2026-11-20T10:00:00');
    await store.tick();
    clock.now = at('2026-11-21T10:00:00');
    await store.tick();
    clock.now = new Date(ms('2026-11-20T10:00:00') + 7 * DAY + 3_600_000);
    await store.tick();
    assert.deepEqual(store.list.map((m) => m.id).sort(), [young.id, pending.id].sort());
    assert.equal(setup(dir, clock).store.list.some((m) => m.id === old.id), false);
  }),
);

// ---------------------------------------------------------------- editing

test(
  'a pending message can be moved, and launches at its new time only',
  withDir(async (dir) => {
    const clock = { now: at('2026-11-20T09:00:00') };
    const { store, launched } = setup(dir, clock);
    const { id } = store.upsert(base);
    store.upsert({ ...base, id, at: ms('2026-11-20T12:00:00'), prompt: 'Otro prompt' });
    clock.now = at('2026-11-20T10:00:05');
    await store.tick();
    assert.equal(launched.length, 0);
    clock.now = at('2026-11-20T12:00:05');
    await store.tick();
    assert.deepEqual(launched.map((r) => r.prompt), ['Otro prompt']);
    assert.equal(store.list.length, 1);
  }),
);

test(
  'a pending message can be cancelled, and nothing launches',
  withDir(async (dir) => {
    const clock = { now: at('2026-11-20T09:00:00') };
    const { store, launched } = setup(dir, clock);
    const { id } = store.upsert(base);
    store.remove(id);
    clock.now = at('2026-11-20T10:00:05');
    await store.tick();
    assert.equal(launched.length, 0);
    assert.equal(store.list.length, 0);
  }),
);

test(
  'a launched message cannot be edited but can be removed; one being launched can be neither',
  withDir(async (dir) => {
    const clock = { now: at('2026-11-20T09:00:00') };
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    const { store } = setup(dir, clock, { hold });
    const { id } = store.upsert(base);
    clock.now = at('2026-11-20T10:00:05');
    const running = store.tick();
    assert.throws(() => store.upsert({ ...base, id, at: ms('2026-11-20T12:00:00') }), { message: 'Ese mensaje se está lanzando', status: 409 });
    assert.throws(() => store.remove(id), { message: 'Ese mensaje se está lanzando', status: 409 });
    release();
    await running;
    assert.throws(() => store.upsert({ ...base, id, at: ms('2026-11-20T12:00:00') }), { message: 'Ese mensaje ya se ha lanzado', status: 409 });
    store.remove(id);
    assert.equal(store.list.length, 0);
  }),
);

test(
  'an unknown id, a machine or folder the hub does not know, an invalid message and one beyond 50 are refused',
  withDir(async (dir) => {
    const clock = { now: at('2026-11-20T09:00:00') };
    const { store } = setup(dir, clock);
    assert.throws(() => store.upsert({ ...base, id: 'nada' }), { message: 'Ese mensaje programado ya no existe', status: 404 });
    assert.throws(() => store.remove('nada'), { message: 'Ese mensaje programado ya no existe', status: 404 });
    assert.throws(() => store.upsert({ ...base, host: 'mac' }), { message: 'No existe la máquina «mac»', status: 400 });
    assert.throws(() => store.upsert({ ...base, target: { folder: '~/otra' } }), { message: 'Esa carpeta no está entre las de drangleic', status: 400 });
    assert.throws(() => store.upsert({ ...base, at: ms('2026-11-20T08:00:00') }), { message: 'Esa hora ya ha pasado', status: 400 });
    for (let i = 0; i < 50; i++) store.upsert(base);
    assert.throws(() => store.upsert(base), { message: 'Como mucho 50 mensajes programados', status: 400 });
  }),
);

test(
  'the messages survive a restart, and every change is told to who listens',
  withDir(async (dir) => {
    const clock = { now: at('2026-11-20T09:00:00') };
    const { store } = setup(dir, clock);
    const changes: number[] = [];
    store.on('change', (list: ScheduledMessage[]) => changes.push(list.length));
    const { id } = store.upsert({ ...base, worktree: true, base: 'master' });
    store.upsert({ ...base, name: 'Otro' });
    store.remove(id);
    assert.deepEqual(changes, [1, 2, 1]);
    const again = setup(dir, clock).store.list;
    assert.equal(again.length, 1);
    assert.equal(again[0].name, 'Otro');
    assert.equal(again[0].status, 'pending');
  }),
);
