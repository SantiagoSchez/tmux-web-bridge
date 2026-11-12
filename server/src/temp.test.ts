import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, statSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { HostInfo, WindowInfo } from '../../shared/types.js';
import { runAction } from './actions.js';
import type { HostMonitor } from './host.js';
import { TempFolders } from './temp.js';

/**
 * A host without tmux whose temp dir is `tmp`: its scripts run here, its tmux commands
 * are noted in `tmux` (a new space or window is $1 @1 %1). Emits nothing by itself.
 */
function fakeHost(tmp: string, tmux: string[][] = []): HostMonitor & { shells: Promise<string>[] } {
  const shells: Promise<string>[] = [];
  const shell = (script: string) => {
    const p = new Promise<string>((resolve, reject) =>
      execFile('/bin/sh', ['-c', script], { env: { PATH: process.env.PATH, HOME: tmp, TMPDIR: tmp } }, (err, out) => (err ? reject(err) : resolve(out))),
    );
    shells.push(p);
    return p;
  };
  const run = async (args: string[]) => {
    tmux.push(args);
    return '$1 @1 %1';
  };
  const listeners: ((info: HostInfo) => void)[] = [];
  return { name: 'Prueba', shells, exec: { shell, run }, on: (_: string, f: (info: HostInfo) => void) => listeners.push(f) } as unknown as HostMonitor & { shells: Promise<string>[] };
}

function withTmp(fn: (tmp: string) => Promise<void>): () => Promise<void> {
  return async () => {
    const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'twb-tmpdir-')));
    try {
      await fn(tmp);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  };
}

const win = (id: string, temp: string | undefined, ...paths: string[]): WindowInfo => ({
  id, index: 0, name: id, active: true, icon: '', state: null, pinned: false, temp, bell: false, activity: false, zoomed: false,
  panes: paths.map((path, i) => ({ id: `%${i}`, index: i, active: i === 0, command: 'zsh', path, title: '', icon: '', state: null, width: 80, height: 24, dead: false, inMode: false })),
});
const snap = (...windows: WindowInfo[]): HostInfo => ({ id: 'h', name: 'h', status: 'ok', sessions: [{ id: '$1', name: 's', num: 1, icon: '', attached: 0, windows }] });
/** Until every script it started (and those they led to) is done. */
const settle = async (host: { shells: Promise<string>[] }) => {
  for (let n = 0; ; n++) {
    await new Promise((r) => setTimeout(r, 10));
    if (n >= host.shells.length) return;
    await host.shells[n].catch(() => {});
  }
};

test(
  'a temp space: a new folder in the temp dir, a space tmp-xxxx there marked with it, running the command',
  withTmp(async (tmp) => {
    const tmux: string[][] = [];
    const res = await runAction(fakeHost(tmp, tmux), { op: 'tempSpace', skipPermissions: true }, null, { folders: [], command: 'claude' });
    assert.deepEqual(res, { session: '$1' });
    const [dir] = readdirSync(tmp);
    assert.match(dir, /^twb-tmp-[a-z0-9]{4}$/);
    assert.equal(statSync(join(tmp, dir)).mode & 0o777, 0o700);
    const name = dir.replace(/^twb-/, '');
    assert.deepEqual(tmux[0], ['new-session', '-d', '-E', '-P', '-F', '#{session_id} #{window_id} #{pane_id}', '-s', name, '-c', join(tmp, dir)]);
    assert.deepEqual(tmux[1], ['set-option', '-w', '-t', '@1', '@twb_temp', join(tmp, dir)]);
    assert.deepEqual(tmux[2], ['send-keys', '-t', '%1', 'claude --dangerously-skip-permissions', 'Enter']);
  }),
);

test(
  'a temp window in a space: named tmp-xxxx and pinned',
  withTmp(async (tmp) => {
    const tmux: string[][] = [];
    const res = await runAction(fakeHost(tmp, tmux), { op: 'tempSpace', session: '$3' }, null, { folders: [], command: 'claude' });
    assert.deepEqual(res, { window: '@1', pane: '%1' });
    const dir = join(tmp, readdirSync(tmp)[0]);
    assert.deepEqual(tmux[0].slice(0, 6), ['new-window', '-P', '-F', '#{session_id} #{window_id} #{pane_id}', '-t', '$3:']);
    assert.deepEqual(tmux[0].slice(6), ['-c', dir, '-n', dir.split('/').pop()!.replace(/^twb-/, '')]);
    assert.deepEqual(tmux[1], ['set-option', '-w', '-t', '@1', '@twb_temp', dir, ';', 'set-option', '-w', '-t', '@1', '@name_pinned', '1']);
    await assert.rejects(runAction(fakeHost(tmp), { op: 'tempSpace', session: 'x' }), /inválido/);
  }),
);

test(
  'a temp folder goes once no window is marked with it and no pane is in it',
  withTmp(async (tmp) => {
    const host = fakeHost(tmp);
    const temps = new TempFolders(host);
    const a = join(tmp, 'twb-tmp-aaaa');
    const b = join(tmp, 'twb-tmp-bbbb');
    mkdirSync(join(a, 'sub'), { recursive: true });
    mkdirSync(b);
    temps.check(snap(win('@1', a, a), win('@2', b, b)));
    await settle(host);
    // Its window closed, but a pane of another window is inside it: it stays.
    temps.check(snap(win('@2', b, b, join(a, 'sub'))));
    await settle(host);
    assert.ok(existsSync(a));
    temps.check(snap(win('@2', b, b)));
    await settle(host);
    assert.ok(!existsSync(a));
    assert.ok(existsSync(b));
    // A host that cannot be reached is not a host without windows.
    temps.check({ ...snap(), status: 'error' });
    await settle(host);
    assert.ok(existsSync(b));
  }),
);

test(
  'after (re)connecting, old temp folders no window uses are swept; recent ones and used ones stay',
  withTmp(async (tmp) => {
    const host = fakeHost(tmp);
    const temps = new TempFolders(host);
    const old = new Date(Date.now() - 10 * 60_000);
    const orphan = join(tmp, 'twb-tmp-orph');
    const used = join(tmp, 'twb-tmp-used');
    const recent = join(tmp, 'twb-tmp-zzzz'); // the last one looked at: the script must not fail on it
    const other = join(tmp, 'otra-cosa');
    for (const d of [orphan, used, recent, other]) mkdirSync(d);
    for (const d of [orphan, used, other]) utimesSync(d, old, old);
    temps.check(snap(win('@1', undefined, used)));
    await settle(host);
    assert.ok(!existsSync(orphan));
    assert.ok(existsSync(used) && existsSync(recent) && existsSync(other));
  }),
);
