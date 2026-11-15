import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { HostInfo, SavedFolder } from '../../shared/types.js';
import { ExtTokenStore } from './ext.js';
import { cardWindowName, cardWorktreeName, runWorktreeName, WORKTREE_MAX, worktreeNameProblem } from '../../shared/worktree.js';
import { hostTargets, launchTask, shellWord, targetFolder, taskCommand, taskWindowName } from './tasks.js';
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

test('a task in a worktree the hub made goes into it first, without --worktree', () => {
  assert.equal(taskCommand('claude', false, 'hola', undefined, "/r/it's/.claude/worktrees/feat-x"), "cd '/r/it'\\''s/.claude/worktrees/feat-x' && claude --permission-mode auto 'hola'");
  assert.equal(taskCommand('claude', true, '', undefined, '/r/w'), "cd '/r/w' && claude --dangerously-skip-permissions");
});

test('a card worktree: bugfix/ with a bug, fix or issue label, feature/ otherwise, then its number and title', () => {
  const card = (name: string, ...labels: string[]) => ({ idShort: 142, name, labels: labels.map((l) => ({ name: l })) });
  assert.equal(cardWorktreeName(card('Arreglar el login del móvil')), 'feature/142-arreglar-el-login-del-movil');
  assert.equal(cardWorktreeName(card('Login', 'Frontend', '')), 'feature/142-login');
  assert.equal(cardWorktreeName(card('Login', 'Debugging')), 'feature/142-login');
  assert.equal(cardWorktreeName(card('Login', 'Hotfix')), 'feature/142-login');
  for (const label of ['bug', 'Bug', 'BUGS', 'Bug crítico', 'issue', 'Issues', 'Íssue', 'Bugfix', 'bugfixes', 'Fix', 'fixes']) {
    assert.equal(cardWorktreeName(card('Login', 'Frontend', label)), 'bugfix/142-login', label);
  }
  assert.equal(cardWorktreeName({ name: '¡Hola!' }), 'feature/hola');
  assert.equal(cardWorktreeName({ name: '¡!' }), 'feature/tarea');
  assert.equal(cardWorktreeName({ idShort: 9, name: '¡!' }), 'feature/9');
  const long = cardWorktreeName({ idShort: 7, name: 'una tarjeta con un título larguísimo que no cabe entero en el nombre de un worktree', labels: [{ name: 'bug' }] });
  assert.ok(long.length <= WORKTREE_MAX && long.startsWith('bugfix/7-una-tarjeta') && !long.endsWith('-'), long);
  assert.equal(worktreeNameProblem(long), null);
});

test('a card window: its worktree with feat/ or bug/ for short, any other name as it is', () => {
  assert.equal(cardWindowName('feature/142-login'), 'feat/142-login');
  assert.equal(cardWindowName('bugfix/142-login'), 'bug/142-login');
  assert.equal(cardWindowName('hotfix/142-login'), 'hotfix/142-login');
  assert.equal(cardWindowName('142-feature/login'), '142-feature/login');
});

test('worktree names: a run and its date, and what is not valid', () => {
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
        return args.includes('#{window_id} #{pane_id}') ? '@8 %21\n' : '%21\n';
      case 'display-message':
        if (args.includes('#{pane_current_path}')) return `${home}/espacio\n`;
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
  'an open space with a folder gets a new window in that folder',
  withHome(async (home) => {
    mkdirSync(join(home, 'Proyectos/blog'), { recursive: true });
    const tmux: string[][] = [];
    const folders: SavedFolder[] = [{ name: 'Proyectos', path: '~/Proyectos', subfolders: true }];
    const host = fakeHost(home, tmux, [{ id: '$3', name: 'twb' }]);
    const res = await launchTask(host, { folders, command: 'claude' }, { target: { session: '$3', folder: '~/Proyectos', sub: 'blog' }, prompt: 'hola', name: 'Tarjeta' });
    assert.ok(!tmux.some((a) => a[0] === 'new-session'));
    assert.deepEqual(tmux.find((a) => a[0] === 'new-window'), ['new-window', '-P', '-F', '#{window_id} #{pane_id}', '-t', '$3:', '-c', join(home, 'Proyectos/blog'), '-n', 'Tarjeta']);
    assert.deepEqual(keys(tmux)[0], ['-l', "claude --permission-mode auto 'hola'"]);
    assert.deepEqual([res.session, res.space, res.createdSpace], ['$3', 'twb', false]);
    await assert.rejects(launchTask(host, { folders, command: 'claude' }, { target: { session: '$3', folder: '~/Proyectos', sub: 'nuevo' }, prompt: 'x' }), /No existe la carpeta/);
    await assert.rejects(launchTask(host, { folders, command: 'claude' }, { target: { session: '$3', folder: '/etc' }, prompt: 'x' }), /no está entre las de Mac/);
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
  'nothing is launched without a prompt, or somewhere it should not go',
  withHome(async (home) => {
    const tmux: string[][] = [];
    const host = fakeHost(home, tmux, [{ id: '$3', name: 'otro' }]);
    const machine = { folders: [{ name: 'twb', path: '~/twb' }], command: 'claude' };
    await assert.rejects(launchTask(host, machine, { target: { session: '$3' }, prompt: '   ' }), /Falta el prompt/);
    await assert.rejects(launchTask(host, machine, { target: { session: '$3; kill-server' }, prompt: 'x' }), /Espacio inválido/);
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

// ---------------------------------------------------------------- the base branch of a worktree

test(
  "a target's folder: the added folder, or where a new window of the open space starts",
  withHome(async (home) => {
    mkdirSync(join(home, 'Proyectos/twb'), { recursive: true });
    const tmux: string[][] = [];
    const host = fakeHost(home, tmux, [{ id: '$3', name: 'otro' }]);
    const machine = { folders: [{ name: 'Proyectos', path: '~/Proyectos', subfolders: true }], command: 'claude' };
    assert.equal(await targetFolder(host, machine, { folder: '~/Proyectos', sub: 'twb' }), join(home, 'Proyectos/twb'));
    assert.equal(await targetFolder(host, machine, { session: '$3', folder: '~/Proyectos', sub: 'twb' }), join(home, 'Proyectos/twb'));
    assert.equal(await targetFolder(host, machine, { session: '$3' }), join(home, 'espacio'));
    assert.deepEqual(tmux.find((a) => a[0] === 'display-message'), ['display-message', '-p', '-t', '$3:', '#{pane_current_path}']);
    await assert.rejects(targetFolder(host, machine, { session: '$4' }), /ya no está abierto/);
    await assert.rejects(targetFolder(host, machine, { session: '$3;x' }), /Espacio inválido/);
    await assert.rejects(targetFolder(host, machine, { folder: '/etc' }), /no está entre las de Mac/);
    await assert.rejects(targetFolder(host, machine, {} as never), /Falta el destino/);
  }),
);

/**
 * A clone at home/repo of a bare origin with master and release/2.0 (one commit ahead), and
 * the machine's folders with it, for a launch with a base.
 */
function cloneAt(home: string) {
  const env = { PATH: process.env.PATH, HOME: home };
  const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, ...args], { env, stdio: 'pipe' }).toString().trim();
  writeFileSync(join(home, '.gitconfig'), '[user]\n\tname = t\n\temail = t@example.org\n[init]\n\tdefaultBranch = master\n');
  const seed = join(home, 'seed');
  mkdirSync(seed);
  git(seed, 'init', '-q');
  writeFileSync(join(seed, 'a'), '1');
  git(seed, 'add', 'a');
  git(seed, 'commit', '-qm', 'one');
  git(seed, 'branch', 'feature/login');
  git(seed, 'checkout', '-qb', 'release/2.0');
  git(seed, 'commit', '-q', '--allow-empty', '-m', 'release');
  git(seed, 'checkout', '-q', 'master');
  execFileSync('git', ['clone', '-q', '--bare', seed, join(home, 'origin.git')], { env, stdio: 'pipe' });
  execFileSync('git', ['clone', '-q', join(home, 'origin.git'), join(home, 'repo')], { env, stdio: 'pipe' });
  return { git, repo: join(home, 'repo'), machine: { folders: [{ name: 'repo', path: '~/repo' }], command: 'claude' } };
}

test(
  'with a base, the worktree is prepared before any window opens, and claude starts in it',
  withHome(async (home) => {
    const { git, repo, machine } = cloneAt(home);
    const tmux: string[][] = [];
    const res = await launchTask(fakeHost(home, tmux), machine, { target: { folder: '~/repo' }, prompt: 'hola', worktree: 'feature/14-login', base: 'release/2.0' });
    const path = join(repo, '.claude/worktrees/feature-14-login');
    assert.equal(git(path, 'rev-parse', 'HEAD'), git(repo, 'rev-parse', 'origin/release/2.0'));
    assert.deepEqual(keys(tmux)[0], ['-l', `cd '${path}' && claude --permission-mode auto 'hola'`]);
    assert.equal(res.notice, undefined);
  }),
);

test(
  "an existing worktree branch is reused, and the launch says the base was not applied",
  withHome(async (home) => {
    const { machine } = cloneAt(home);
    mkdirSync(join(home, '.claude'));
    writeFileSync(join(home, '.claude/settings.json'), '{ "hooks": { "WorktreeCreate": [] } }');
    const tmux: string[][] = [];
    const res = await launchTask(fakeHost(home, tmux), machine, { target: { folder: '~/repo' }, prompt: '', worktree: 'feature/login', base: 'release/2.0' });
    assert.deepEqual(keys(tmux)[0], ['-l', "claude --permission-mode auto --worktree 'feature/login'"]);
    assert.match(res.notice ?? '', /La rama feature\/login ya existía: se usa tal cual, sin partir de release\/2\.0/);
  }),
);

test(
  'a base that is not valid, or that origin does not have, launches nothing; without a worktree it is ignored',
  withHome(async (home) => {
    const { machine } = cloneAt(home);
    const tmux: string[][] = [];
    const host = fakeHost(home, tmux, [{ id: '$3', name: 'otro' }]);
    await assert.rejects(launchTask(host, machine, { target: { folder: '~/repo' }, prompt: 'x', worktree: 'w', base: 'a b' }), /no es un nombre de rama válido/);
    await assert.rejects(launchTask(host, machine, { target: { folder: '~/repo' }, prompt: 'x', worktree: 'w', base: 'no-existe' }), /No existe la rama base «no-existe» en origin/);
    assert.equal(tmux.length, 0);
    await launchTask(host, machine, { target: { session: '$3' }, prompt: 'hola', base: 'master' });
    assert.ok(!tmux.some((a) => a[0] === 'display-message' && a.includes('#{pane_current_path}')));
    assert.deepEqual(keys(tmux)[0], ['-l', "claude --permission-mode auto 'hola'"]);
  }),
);

/** A WorktreeCreate hook in the user's Claude settings, as the koalarnes plugin adds. */
function withHook(home: string) {
  mkdirSync(join(home, '.claude'), { recursive: true });
  writeFileSync(join(home, '.claude/settings.json'), '{ "hooks": { "WorktreeCreate": [] } }');
}

test(
  'a task in a worktree needs no prompt, and its window is named after the worktree',
  withHome(async (home) => {
    const { machine } = cloneAt(home);
    withHook(home);
    const tmux: string[][] = [];
    const host = fakeHost(home, tmux);
    await launchTask(host, machine, { target: { folder: '~/repo' }, prompt: '', worktree: '142-login' });
    assert.deepEqual(tmux.find((a) => a[0] === 'new-session')?.slice(-2), ['-n', '142-login']);
    assert.deepEqual(keys(tmux)[0], ['-l', "claude --permission-mode auto --worktree '142-login'"]);
    await assert.rejects(launchTask(host, machine, { target: { folder: '~/repo' }, prompt: 'x', worktree: 'no vale' }), /solo admite/);
  }),
);

test(
  'a worktree without a base is prepared too: without a hook the hub makes it from the project base',
  withHome(async (home) => {
    const { git, repo, machine } = cloneAt(home);
    const tmux: string[][] = [];
    const res = await launchTask(fakeHost(home, tmux), machine, { target: { folder: '~/repo' }, prompt: 'hola', worktree: 'w1' });
    const path = join(repo, '.claude/worktrees/w1');
    assert.equal(git(path, 'rev-parse', 'HEAD'), git(repo, 'rev-parse', 'origin/master'));
    assert.equal(git(path, 'branch', '--show-current'), 'w1');
    assert.deepEqual(keys(tmux)[0], ['-l', `cd '${path}' && claude --permission-mode auto 'hola'`]);
    assert.equal(res.notice, undefined);
  }),
);

test(
  'a branch checked out in another folder launches nothing',
  withHome(async (home) => {
    const { repo, machine } = cloneAt(home);
    const tmux: string[][] = [];
    await assert.rejects(
      launchTask(fakeHost(home, tmux), machine, { target: { folder: '~/repo' }, prompt: 'x', worktree: 'master', base: 'release/2.0' }),
      new RegExp(`La rama master está extraída en ${repo}: elige otro nombre para el worktree`),
    );
    assert.ok(!tmux.some((a) => ['new-session', 'new-window', 'send-keys'].includes(a[0])));
  }),
);

test(
  'an unreachable origin: the worktree starts from the known copy of the base, and the launch says so',
  withHome(async (home) => {
    const { git, repo, machine } = cloneAt(home);
    git(repo, 'remote', 'set-url', 'origin', join(home, 'no-existe.git'));
    const tmux: string[][] = [];
    const res = await launchTask(fakeHost(home, tmux), machine, { target: { folder: '~/repo' }, prompt: 'hola', worktree: 'w', base: 'release/2.0' });
    assert.equal(git(join(repo, '.claude/worktrees/w'), 'rev-parse', 'HEAD'), git(repo, 'rev-parse', 'origin/release/2.0'));
    assert.match(res.notice ?? '', /No se ha podido actualizar origin: el worktree parte de la copia local de origin\/release\/2\.0/);
  }),
);

test(
  'an existing branch already at the base, or one launched without a base, says nothing',
  withHome(async (home) => {
    const { machine } = cloneAt(home);
    withHook(home);
    const host = fakeHost(home, []);
    const atBase = await launchTask(host, machine, { target: { folder: '~/repo' }, prompt: '', worktree: 'feature/login', base: 'master' });
    assert.equal(atBase.notice, undefined);
    const noBase = await launchTask(host, machine, { target: { folder: '~/repo' }, prompt: '', worktree: 'feature/login' });
    assert.equal(noBase.notice, undefined);
  }),
);
