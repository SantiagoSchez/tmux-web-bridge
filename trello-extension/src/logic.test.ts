import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commentText, destinations, findDoingList, normalizeHubUrl, renderTemplate, spaceName } from './logic';
import type { CardInfo, ExtHostTargets } from './types';

const card: CardInfo = {
  id: '6abb70733ab5a46e5b4f1f65',
  name: 'Arreglar el login',
  url: 'https://trello.com/c/aB3xYz9q',
  shortLink: 'aB3xYz9q',
  idShort: 142,
  idList: 'l1',
  board: { id: 'b1', name: 'LaborIA' },
};

test('the template gets the card variables and keeps anything else', () => {
  assert.equal(renderTemplate('Haz la tarjeta {url}', card), 'Haz la tarjeta https://trello.com/c/aB3xYz9q');
  assert.equal(renderTemplate('{name} ({shortLink}) en {board}: {otra}', card), 'Arreglar el login (aB3xYz9q) en LaborIA: {otra}');
});

test('the template does not expand $-patterns of the card name', () => {
  assert.equal(renderTemplate('{name}', { ...card, name: "precio $& y $'" }), "precio $& y $'");
});

test('the Doing list is found despite the emoji', () => {
  const lists = [
    { id: '1', name: '🗄 Backlog' },
    { id: '2', name: '📋 Queued' },
    { id: '3', name: '🛠 ToDo' },
    { id: '4', name: '⚙ Doing' },
    { id: '5', name: 'Done 🎉' },
  ];
  assert.equal(findDoingList(lists)?.id, '4');
});

test('the list called just Doing wins, archived ones are skipped, others with the word count', () => {
  assert.equal(findDoingList([{ id: 'a', name: 'Doing (QA)' }, { id: 'b', name: 'DOING' }])?.id, 'b');
  assert.equal(findDoingList([{ id: 'a', name: 'Doing', closed: true }, { id: 'b', name: 'Doing - sprint 3' }])?.id, 'b');
  assert.equal(findDoingList([{ id: 'a', name: 'Undoing' }, { id: 'b', name: 'Done' }]), undefined);
});

const host: ExtHostTargets = {
  id: 'mac',
  name: 'Mac',
  status: 'ok',
  spaces: [
    { id: '$2', name: 'twb', windows: 3 },
    { id: '$1', name: 'blog', windows: 1 },
  ],
  folders: [
    { name: 'Proyectos', path: '~/Proyectos', subfolders: true, missing: false, children: ['api.v2', 'twb'] },
    { name: 'dotfiles', path: '~/dotfiles', missing: false, children: [] },
    { name: 'externo', path: '/Volumes/x', missing: true, children: [] },
    { name: 'Vacía', path: '~/vacia', subfolders: true, missing: false, children: [] },
  ],
};

test('destinations: open spaces, then each folder with subfolders, then the loose ones', () => {
  const groups = destinations(host);
  assert.deepEqual(
    groups.map((g) => g.label),
    ['Spaces abiertos (ventana nueva)', 'Proyectos (carpetas)', 'Carpetas'],
  );
  assert.deepEqual(groups[0].items, [
    { key: 'space:blog', label: 'blog', target: { session: '$1' } },
    { key: 'space:twb', label: 'twb', target: { session: '$2' } },
  ]);
  assert.deepEqual(
    groups[1].items.map((d) => [d.label, d.target]),
    [
      ['api.v2', { folder: '~/Proyectos', sub: 'api.v2' }],
      ['twb · abierto', { folder: '~/Proyectos', sub: 'twb' }],
    ],
  );
  assert.deepEqual(groups[2].items, [{ key: 'folder:~/dotfiles', label: 'dotfiles', target: { folder: '~/dotfiles' } }]);
});

test('a folder is open when a space has the name tmux gives it', () => {
  const groups = destinations({ ...host, spaces: [{ id: '$3', name: 'api-v2', windows: 1 }] });
  assert.equal(groups[1].items[0].label, 'api.v2 · abierto');
  assert.equal(spaceName('a.b:c'), 'a-b-c');
});

test('a machine without spaces or readable folders offers nothing', () => {
  assert.deepEqual(destinations({ ...host, spaces: [], folders: undefined }), []);
});

test('the comment on the card', () => {
  assert.equal(
    commentText({ hostName: 'Mac', space: 'twb', windowName: 'Arreglar el login' }),
    '🤖 Lanzada en Mac › twb · ventana «Arreglar el login»',
  );
});

test('the panel address is kept without a trailing slash', () => {
  assert.equal(normalizeHubUrl(' https://twb.example.com/ '), 'https://twb.example.com');
  assert.equal(normalizeHubUrl('https://example.com/twb/'), 'https://example.com/twb');
  assert.throws(() => normalizeHubUrl('ftp://x'));
  assert.throws(() => normalizeHubUrl('twb.example.com'));
});
