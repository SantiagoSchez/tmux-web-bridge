import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { DirListing, ProjectList, SavedFolder } from '../../shared/types.js';
import { projectCommand, runAction } from './actions.js';
import type { HostMonitor } from './host.js';

/**
 * A host without tmux: its shell scripts run here, with `home` as $HOME. With `tmux`, the
 * tmux commands are noted there (a new space is $1 with pane %1); without it, none may run.
 */
function fakeHost(home: string, tmux?: string[][]): HostMonitor {
  const shell = (script: string) =>
    new Promise<string>((resolve, reject) =>
      execFile('/bin/sh', ['-c', script], { env: { PATH: process.env.PATH, HOME: home } }, (err, out) => (err ? reject(err) : resolve(out))),
    );
  // No tmux here: no spaces open, and nothing may be created.
  const runFormat = async () => '';
  const run = async (args: string[]) => {
    if (!tmux) assert.fail('tmux no se toca en estas pruebas');
    tmux.push(args);
    return '$1 %1';
  };
  return { name: 'Prueba', hostConfig: {}, exec: { shell, runFormat, run } } as unknown as HostMonitor;
}

function withHome(fn: (home: string) => Promise<void>): () => Promise<void> {
  return async () => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), 'twb-home-')));
    try {
      await fn(home);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  };
}

test('a claude projects command gets the permission mode chosen', () => {
  assert.equal(projectCommand('claude', false), 'claude --permission-mode auto');
  assert.equal(projectCommand('claude', true), 'claude --dangerously-skip-permissions');
  assert.equal(projectCommand('~/.local/bin/claude --model opus', true), '~/.local/bin/claude --model opus --dangerously-skip-permissions');
});

test('any other projects command is typed as is', () => {
  assert.equal(projectCommand('nvim .', true), 'nvim .');
  assert.equal(projectCommand('claudette', false), 'claudette');
});

test(
  'listDirs: the folders inside, hidden ones too, with paths under ~',
  withHome(async (home) => {
    for (const d of ['Proyectos/b', 'Proyectos/A', 'Proyectos/.oculta', 'Proyectos/con espacio']) mkdirSync(join(home, d), { recursive: true });
    const host = fakeHost(home);
    const l = (await runAction(host, { op: 'listDirs', path: '~/Proyectos/' })) as DirListing;
    assert.deepEqual(l, { path: '~/Proyectos', parent: '~', dirs: ['.oculta', 'A', 'b', 'con espacio'] });
    const top = (await runAction(host, { op: 'listDirs', path: '~' })) as DirListing;
    assert.equal(top.path, '~');
    assert.equal(top.parent, home.replace(/\/[^/]*$/, '') || '/');
    const root = (await runAction(host, { op: 'listDirs', path: '/' })) as DirListing;
    assert.equal(root.parent, null);
    await assert.rejects(runAction(host, { op: 'listDirs', path: '~/no-existe' }), /No existe la carpeta ~\/no-existe en Prueba/);
    await assert.rejects(runAction(host, { op: 'listDirs', path: 'relativa' }), /tiene que empezar/);
  }),
);

test(
  'listProjects: added folders as they are now, with the folders inside those with subfolders',
  withHome(async (home) => {
    for (const d of ['Proyectos/twb', 'Proyectos/Blog', 'Proyectos/.oculta', 'notas']) mkdirSync(join(home, d), { recursive: true });
    const host = fakeHost(home);
    const folders = [
      { name: 'Proyectos', path: '~/Proyectos', subfolders: true },
      { name: 'Proyectos', path: '~/Proyectos' },
      { name: 'notas', path: '~/notas', subfolders: true },
      { name: 'disco', path: '/Volumes/no-montado' },
    ];
    const list = (await runAction(host, { op: 'listProjects' }, null, { folders, command: 'claude' })) as ProjectList;
    assert.equal(list.home, home);
    assert.deepEqual(list.folders, [
      { name: 'Proyectos', path: '~/Proyectos', subfolders: true, missing: false, children: ['Blog', 'twb'] },
      { name: 'Proyectos', path: '~/Proyectos', missing: false, children: [] },
      { name: 'notas', path: '~/notas', subfolders: true, missing: false, children: [] },
      { name: 'disco', path: '/Volumes/no-montado', missing: true, children: [] },
    ]);
    // Read every time: a folder made later shows up without touching the list.
    mkdirSync(join(home, 'Proyectos/nuevo'));
    const again = (await runAction(host, { op: 'listProjects' }, null, { folders, command: 'claude' })) as ProjectList;
    assert.deepEqual(again.folders[0].children, ['Blog', 'nuevo', 'twb']);
  }),
);

test(
  'openProject: only folders of the host, and new ones only inside a folder with subfolders',
  withHome(async (home) => {
    mkdirSync(join(home, 'Proyectos'));
    const host = fakeHost(home);
    const machine = { folders: [{ name: 'p', path: '~/Proyectos', subfolders: true }, { name: 'disco', path: '/Volumes/no-montado' }], command: 'claude' };
    await assert.rejects(runAction(host, { op: 'openProject', folder: '/etc' }, null, machine), /no está entre las de Prueba/);
    await assert.rejects(runAction(host, { op: 'openProject', folder: '~/Proyectos' }, null, machine), /no está entre las de Prueba/);
    await assert.rejects(runAction(host, { op: 'openProject', folder: '~/Proyectos', sub: '../x', create: true }, null, machine), /inválido/);
    await assert.rejects(runAction(host, { op: 'openProject', folder: '~/Proyectos', sub: 'nuevo' }, null, machine), /No existe la carpeta/);
    await assert.rejects(runAction(host, { op: 'openProject', folder: '/Volumes/no-montado' }, null, machine), /no está en Prueba/);
  }),
);

test(
  'createFolder: a new folder anywhere goes into the host\'s folders, and one inside a folder with subfolders does not',
  withHome(async (home) => {
    mkdirSync(join(home, 'Proyectos/twb'), { recursive: true });
    mkdirSync(join(home, 'otros'));
    const tmux: string[][] = [];
    const host = fakeHost(home, tmux);
    let saved: SavedFolder[] | null = null;
    const machine = { folders: [{ name: 'p', path: '~/Proyectos', subfolders: true }], command: 'claude', save: (f: SavedFolder[]) => (saved = f) };

    const res = await runAction(host, { op: 'createFolder', parent: '~/otros/', name: 'nuevo' }, null, machine);
    assert.deepEqual(res, { session: '$1', created: true });
    assert.ok(existsSync(join(home, 'otros/nuevo')));
    assert.deepEqual(saved, [...machine.folders, { name: 'nuevo', path: '~/otros/nuevo' }]);
    assert.deepEqual(tmux[0], ['new-session', '-d', '-E', '-P', '-F', '#{session_id} #{pane_id}', '-s', 'nuevo', '-c', join(home, 'otros/nuevo')]);

    saved = null;
    await runAction(host, { op: 'createFolder', parent: '~/Proyectos', name: 'blog' }, null, machine);
    assert.ok(existsSync(join(home, 'Proyectos/blog')));
    assert.equal(saved, null);
    // One of those that is there already is opened, as when it is picked from the list.
    await runAction(host, { op: 'createFolder', parent: '~/Proyectos', name: 'twb' }, null, machine);
    assert.deepEqual(tmux.filter((a) => a[0] === 'new-session').map((a) => a.at(-1)), [join(home, 'otros/nuevo'), join(home, 'Proyectos/blog'), join(home, 'Proyectos/twb')]);

    // Added with subfolders, it opens nothing: what it offers are the folders made inside.
    const group = await runAction(host, { op: 'createFolder', parent: '~/otros', name: 'grupo', subfolders: true }, null, machine);
    assert.deepEqual(group, { folder: '~/otros/grupo' });
    assert.ok(existsSync(join(home, 'otros/grupo')));
    assert.deepEqual(saved, [...machine.folders, { name: 'grupo', path: '~/otros/grupo', subfolders: true }]);
    assert.equal(tmux.filter((a) => a[0] === 'new-session').length, 3);

    saved = null;
    await assert.rejects(runAction(host, { op: 'createFolder', parent: '~', name: 'otros' }, null, machine), /Ya existe ~\/otros en Prueba/);
    await assert.rejects(runAction(host, { op: 'createFolder', parent: '~/otros', name: 'p' }, null, machine), /Ya hay una carpeta llamada «p»/);
    await assert.rejects(runAction(host, { op: 'createFolder', parent: '~/no-existe', name: 'x' }, null, machine), /No existe la carpeta ~\/no-existe/);
    await assert.rejects(runAction(host, { op: 'createFolder', parent: '~/otros', name: '../x' }, null, machine), /inválido/);
    await assert.rejects(runAction(host, { op: 'createFolder', parent: 'relativa', name: 'x' }, null, machine), /tiene que empezar/);
    assert.equal(saved, null);
  }),
);
