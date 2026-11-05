import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { DirListing, ProjectList } from '../../shared/types.js';
import { projectCommand, runAction } from './actions.js';
import type { HostMonitor } from './host.js';

/** A host without tmux: its shell scripts run here, with `home` as $HOME. */
function fakeHost(home: string): HostMonitor {
  const shell = (script: string) =>
    new Promise<string>((resolve, reject) =>
      execFile('/bin/sh', ['-c', script], { env: { PATH: process.env.PATH, HOME: home } }, (err, out) => (err ? reject(err) : resolve(out))),
    );
  // No tmux here: no spaces open, and nothing may be created.
  const runFormat = async () => '';
  const run = async () => assert.fail('tmux no se toca en estas pruebas');
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
