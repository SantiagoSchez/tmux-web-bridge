import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { HostInfo, SavedFolder } from '../../shared/types.js';
import { ExtTokenStore } from './ext.js';
import { cardWorktreeName, runWorktreeName, WORKTREE_MAX, worktreeNameProblem } from '../../shared/worktree.js';
import { hostTargets, launchTask, shellWord, taskCommand, taskWindowName } from './tasks.js';
import type { HostMonitor } from './host.js';

function tempDir(prefix: string): string {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

test('the token works until revoked, survives a restart and only its hash is kept', () => {
  const dir = tempDir('twb-ext-');
  try {
    const store = new ExtTokenStore(dir);
    assert.equal(store.info.active, false);
    assert.equal(store.check('Bearer nada'), false);

    const token = store.generate();
    assert.match(token, /^twbx_[A-Za-z0-9_-]{43}$/);
    assert.equal(store.check(`Bearer ${token}`), true);
    assert.equal(store.check(`bearer ${token}`), true);
    assert.equal(store.check(token), false);
    assert.equal(store.check(`Bearer ${token}x`), false);
    assert.equal(store.check(undefined), false);
    assert.ok(!readFileSync(join(dir, 'ext-token.json'), 'utf8').includes(token));
    assert.equal(statSync(join(dir, 'ext-token.json')).mode & 0o777, 0o600);

    const again = new ExtTokenStore(dir);
    assert.equal(again.check(`Bearer ${token}`), true);
    assert.ok(again.info.createdAt! > 0);

    const other = again.generate();
    assert.equal(again.check(`Bearer ${token}`), false);
    assert.equal(again.check(`Bearer ${other}`), true);

    again.revoke();
    assert.equal(again.check(`Bearer ${other}`), false);
    assert.equal(new ExtTokenStore(dir).info.active, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a card name becomes a short window name of one line', () => {
  assert.equal(taskWindowName('  Arreglar\nel   login  '), 'Arreglar el login');
  assert.equal(taskWindowName('Una tarjeta con un nombre bastante largo de verdad'), 'Una tarjeta con un nombre bas…');
  assert.equal([...taskWindowName('🐛'.repeat(40))].length, 30);
  assert.equal(taskWindowName(undefined), '');
  assert.equal(taskWindowName(42), '');
});

/** What the shell makes of a word: the argument it hands to the program. */
function shellArg(shell: string, word: string): Promise<string> {
  return new Promise((resolve, reject) =>
    execFile(shell, ['-c', `printf %s ${word}`], (err, out) => (err ? reject(err) : resolve(out))),
  );
}

test('the prompt reaches claude as one argument, as is', async () => {
  const texts = ['Haz la tarjeta https://trello.com/c/abc', "it's $HOME `id` \"x\" \\n ; & | *", 'dos\nlíneas\tcon tab', "mezcla 'comillas'\ny \\barras\\"];
  const shells = ['/bin/bash', '/bin/zsh'].filter((s) => {
    try {
      statSync(s);
      return true;
    } catch {
      return false;
    }
  });
  assert.ok(shells.length, 'hace falta bash o zsh');
  for (const shell of shells) for (const t of texts) assert.equal(await shellArg(shell, shellWord(t)), t, `${shell}: ${JSON.stringify(t)}`);
  assert.equal(shellWord('sin nada raro'), "'sin nada raro'");
  assert.ok(shellWord('a\nb').startsWith("$'"));
});

test('a task runs the machine command when it is claude, and plain claude otherwise', () => {
  assert.equal(taskCommand('claude', false, 'hola'), "claude --permission-mode auto 'hola'");
  assert.equal(taskCommand('claude --model opus', true, 'hola'), "claude --model opus --dangerously-skip-permissions 'hola'");
  assert.equal(taskCommand('', false, 'hola'), "claude --permission-mode auto 'hola'");
  assert.equal(taskCommand('nvim', false, 'hola'), "claude --permission-mode auto 'hola'");
});

test('a task in a worktree starts claude with --worktree, with or without a prompt', () => {
  assert.equal(taskCommand('claude', false, 'hola', '142-login'), "claude --permission-mode auto --worktree '142-login' 'hola'");
  assert.equal(taskCommand('claude', true, '', 'feat/x'), "claude --dangerously-skip-permissions --worktree 'feat/x'");
});

test('worktree names: a card number and its title, a run and its date, and what is not valid', () => {
  assert.equal(cardWorktreeName(142, 'Arreglar el login del móvil'), '142-arreglar-el-login-del-movil');
  assert.equal(cardWorktreeName(undefined, '¡Hola!'), 'hola');
  const long = cardWorktreeName(7, 'una tarjeta con un título larguísimo que no cabe entero en el nombre de un worktree');
  assert.ok(long.length <= WORKTREE_MAX && long.startsWith('7-') && !long.endsWith('-'), long);
  assert.equal(runWorktreeName('Deps nocturnas', new Date(2026, 10, 12, 18, 0)), 'deps-nocturnas-20261112-1800');
  assert.equal(worktreeNameProblem('142-login'), null);
  assert.equal(worktreeNameProblem('feat/login'), null);
  assert.ok(worktreeNameProblem('con espacios'));
  assert.ok(worktreeNameProblem('a/../b'));
  assert.ok(worktreeNameProblem('x'.repeat(65)));
});

/**
 * A host without tmux: shell scripts run here with `home` as $HOME, tmux commands are noted
 * in `tmux` and answered as a server with the spaces of `sessions` would.
 */
function fakeHost(home: string, tmux: string[][], sessions: { id: string; name: string }[] = [], status: HostInfo['status'] = 'ok'): HostMonitor {
  const shell = (script: string) =>
    new Promise<string>((resolve, reject) =>
      execFile('/bin/sh', ['-c', script], { env: { PATH: process.env.PATH, HOME: home } }, (err, out) => (err ? reject(err) : resolve(out))),
    );
  const run = async (args: string[]) => {
    tmux.push(args);
    switch (args[0]) {
      case 'list-sessions':
        return sessions.map((s) => `${s.id}\t${s.name}`).join('\n');
      case 'new-session':
        return '$9 %20\n';
      case 'new-window':
        return '%21\n';
      case 'display-message':
        return args.includes('%20') ? '@7\tla ##tarjeta\n' : '@8\tla tarjeta\n';
      default:
        return '';
    }
  };
  const snapshot: HostInfo = {
    id: 'mac',
    name: 'Mac',
    status,
    sessions: sessions.map((s) => ({ id: s.id, name: s.name, num: null, icon: '', attached: 0, windows: [] })),
  };
  return { id: 'mac', name: 'Mac', hostConfig: {}, snapshot, exec: { shell, run, runFormat: run } } as unknown as HostMonitor;
}

function withHome(fn: (home: string) => Promise<void>): () => Promise<void> {
  return async () => {
    const home = tempDir('twb-home-');
    try {
      await fn(home);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  };
}

const keys = (tmux: string[][]) => tmux.filter((a) => a[0] === 'send-keys').map((a) => a.slice(3));

test(
  'a folder without a space gets one, and the task goes in its first window, named and pinned',
  withHome(async (home) => {
    mkdirSync(join(home, 'Proyectos/twb'), { recursive: true });
    const tmux: string[][] = [];
    const folders: SavedFolder[] = [{ name: 'Proyectos', path: '~/Proyectos', subfolders: true }];
    const res = await launchTask(fakeHost(home, tmux), { folders, command: 'claude' }, {
      target: { folder: '~/Proyectos', sub: 'twb' },
      prompt: 'Haz la tarjeta https://trello.com/c/abc',
      name: 'la #tarjeta',
    });
    const created = tmux.find((a) => a[0] === 'new-session')!;
    assert.deepEqual(created.slice(-4), ['-c', join(home, 'Proyectos/twb'), '-n', 'la ##tarjeta']);
    assert.ok(tmux.some((a) => a.join(' ') === 'set-option -w -t %20 @name_pinned 1'));
    assert.ok(!tmux.some((a) => a[0] === 'new-window'));
    assert.deepEqual(keys(tmux), [["-l", "claude --permission-mode auto 'Haz la tarjeta https://trello.com/c/abc'"], ['Enter']]);
    assert.deepEqual(res, { host: 'mac', hostName: 'Mac', session: '$9', space: 'twb', window: '@7', windowName: 'la ##tarjeta', pane: '%20', createdSpace: true });
  }),
);

test(
  'a folder with its space open gets a new window there, in the folder',
  withHome(async (home) => {
    mkdirSync(join(home, 'Proyectos/twb'), { recursive: true });
    const tmux: string[][] = [];
    const folders: SavedFolder[] = [{ name: 'twb', path: '~/Proyectos/twb' }];
    const res = await launchTask(fakeHost(home, tmux, [{ id: '$3', name: 'twb' }]), { folders, command: 'claude' }, {
      target: { folder: '~/Proyectos/twb' },
      prompt: 'hola',
      name: 'Tarjeta',
      skipPermissions: true,
    });
    assert.ok(!tmux.some((a) => a[0] === 'new-session'));
    assert.deepEqual(tmux.find((a) => a[0] === 'new-window'), ['new-window', '-P', '-F', '#{pane_id}', '-t', '$3:', '-c', join(home, 'Proyectos/twb'), '-n', 'Tarjeta']);
    assert.deepEqual(keys(tmux)[0], ['-l', "claude --dangerously-skip-permissions 'hola'"]);
    assert.equal(res.createdSpace, false);
    assert.equal(res.session, '$3');
    assert.equal(res.pane, '%21');
  }),
);

test(
  'an open space gets a new window; without a name, the kit names it',
  withHome(async (home) => {
    const tmux: string[][] = [];
    const res = await launchTask(fakeHost(home, tmux, [{ id: '$3', name: 'otro' }]), { folders: [], command: '' }, { target: { session: '$3' }, prompt: 'hola' });
    assert.deepEqual(tmux.find((a) => a[0] === 'new-window'), ['new-window', '-P', '-F', '#{pane_id}', '-t', '$3:', '-c', '#{pane_current_path}']);
    assert.ok(!tmux.some((a) => a[0] === 'set-option'));
    assert.deepEqual(keys(tmux)[0], ['-l', "claude --permission-mode auto 'hola'"]);
    assert.equal(res.space, 'otro');
  }),
);

test(
  'a task in a worktree needs no prompt, and its window is named after the worktree',
  withHome(async (home) => {
    const tmux: string[][] = [];
    const host = fakeHost(home, tmux, [{ id: '$3', name: 'otro' }]);
    await launchTask(host, { folders: [], command: 'claude' }, { target: { session: '$3' }, prompt: '', worktree: '142-login' });
    assert.deepEqual(tmux.find((a) => a[0] === 'new-window')?.slice(-2), ['-n', '142-login']);
    assert.deepEqual(keys(tmux)[0], ['-l', "claude --permission-mode auto --worktree '142-login'"]);
    await assert.rejects(launchTask(host, { folders: [], command: 'claude' }, { target: { session: '$3' }, prompt: 'x', worktree: 'no vale' }), /solo admite/);
  }),
);

test(
  'nothing is launched without a prompt, or somewhere it should not go',
  withHome(async (home) => {
    const tmux: string[][] = [];
    const host = fakeHost(home, tmux, [{ id: '$3', name: 'otro' }]);
    const machine = { folders: [{ name: 'twb', path: '~/twb' }], command: 'claude' };
    await assert.rejects(launchTask(host, machine, { target: { session: '$3' }, prompt: '   ' }), /Falta el prompt/);
    await assert.rejects(launchTask(host, machine, { target: { session: '$3; kill-server' }, prompt: 'x' }), /Space inválido/);
    await assert.rejects(launchTask(host, machine, { target: { session: '$4' }, prompt: 'x' }), /ya no está abierto/);
    await assert.rejects(launchTask(host, machine, { target: { folder: '/etc' }, prompt: 'x' }), /no está entre las de Mac/);
    await assert.rejects(launchTask(host, machine, { target: { folder: '~/twb', sub: 'nuevo' }, prompt: 'x' }), /no está entre las de Mac/);
    await assert.rejects(launchTask(host, machine, { target: {} as never, prompt: 'x' }), /Falta el destino/);
    assert.ok(!tmux.some((a) => ['new-session', 'new-window', 'send-keys'].includes(a[0])));
  }),
);

test(
  'targets: open spaces and folders of a machine; a machine down gives only what is known',
  withHome(async (home) => {
    mkdirSync(join(home, 'Proyectos/b'), { recursive: true });
    mkdirSync(join(home, 'Proyectos/a'), { recursive: true });
    const folders: SavedFolder[] = [{ name: 'Proyectos', path: '~/Proyectos', subfolders: true }];
    const up = await hostTargets(fakeHost(home, [], [{ id: '$1', name: 'twb' }]), { folders, command: 'claude' });
    assert.deepEqual(up.spaces, [{ id: '$1', name: 'twb', windows: 0 }]);
    assert.deepEqual(up.folders?.[0].children, ['a', 'b']);
    const down = await hostTargets(fakeHost(home, [], [], 'error'), { folders, command: 'claude' });
    assert.equal(down.folders, undefined);
    assert.equal(down.status, 'error');
  }),
);
