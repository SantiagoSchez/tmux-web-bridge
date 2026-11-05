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
  return { name: 'Prueba', hostConfig: { projects: null }, exec: { shell } } as unknown as HostMonitor;
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
  'listProjects: a host without a projects dir lists its added folders, marking the missing ones',
  withHome(async (home) => {
    mkdirSync(join(home, 'trabajo'));
    const list = (await runAction(fakeHost(home), { op: 'listProjects' }, null, [
      { name: 'trabajo', path: '~/trabajo' },
      { name: 'disco', path: '/Volumes/no-montado' },
    ])) as ProjectList;
    assert.deepEqual(list, {
      dir: null,
      projects: [],
      shortcuts: [],
      folders: [
        { name: 'trabajo', path: '~/trabajo', missing: false },
        { name: 'disco', path: '/Volumes/no-montado', missing: true },
      ],
    });
  }),
);
