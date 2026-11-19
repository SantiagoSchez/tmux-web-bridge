import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { TrelloNotFoundError, TrelloService, TrelloSetupError } from './trello.js';

const KEY = '0123456789abcdef0123456789abcdef';
const TOKEN = 'ATTA0123456789abcdef0123456789abcdef0123456789';
const CARD = '6af591872c4200f242148384';

/** A Trello API that knows one card on a board with Backlog and ⚙ Doing; it notes every call. */
function fakeTrello(calls: string[], opts: { doing?: boolean; failComment?: boolean } = {}): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${url.pathname}${method === 'GET' ? '' : url.search}`);
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
    const auth = String((init?.headers as Record<string, string>)?.Authorization ?? '');
    if (!auth.includes(`oauth_consumer_key="${KEY}"`)) return json('invalid key', 401);
    if (url.pathname === '/1/members/me') return json({ username: 'santi', fullName: 'Santi' });
    if (url.pathname === `/1/cards/${CARD}` && method === 'GET') {
      const fields = url.searchParams.get('fields')?.split(',') ?? [];
      const labels = [{ id: 'l1', name: 'Bug', color: 'red' }, { id: 'l2', name: '', color: null }];
      return json({ id: CARD, name: 'Login', shortUrl: 'https://trello.com/c/abc', shortLink: 'abc', idShort: 3, idList: 'backlog', board: { id: 'b1', name: 'Tablero' }, ...(fields.includes('labels') ? { labels } : {}) });
    }
    if (url.pathname === '/1/boards/b1/lists') {
      return json([{ id: 'backlog', name: '🗄 Backlog', closed: false }, ...(opts.doing === false ? [] : [{ id: 'doing', name: '⚙ Doing', closed: false }])]);
    }
    // Card number 470 of board 0mGPkF10, looked up by its short number like the real API does.
    if (url.pathname === '/1/boards/0mGPkF10/cards/470' && method === 'GET') return json({ id: CARD, shortUrl: 'https://trello.com/c/K9xY2abc' });
    // Answers that are not a Trello page: the panel would put them in a tab of its own origin.
    if (url.pathname === '/1/boards/0mGPkF10/cards/471' && method === 'GET') return json({ id: CARD, shortUrl: 'javascript:alert(1)' });
    if (url.pathname === '/1/boards/0mGPkF10/cards/472' && method === 'GET') return json({ id: CARD, shortUrl: 'https://trello.com.example.org/c/x' });
    if (url.pathname === `/1/cards/${CARD}` && method === 'PUT') return json({});
    if (url.pathname === `/1/cards/${CARD}/actions/comments`) return opts.failComment ? json('nope', 500) : json({});
    return json('not found', 404);
  }) as typeof fetch;
}

function withDir(fn: (dir: string) => Promise<void>): () => Promise<void> {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), 'twb-trello-'));
    try {
      await fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

test(
  'the account is kept (0600) only once Trello takes it, and survives a restart',
  withDir(async (dir) => {
    const calls: string[] = [];
    const t = new TrelloService(dir, fakeTrello(calls));
    assert.deepEqual(await t.info(), { configured: false });
    await assert.rejects(t.set('corta', TOKEN), /32 caracteres/);
    await assert.rejects(t.set('f'.repeat(32), TOKEN), TrelloSetupError);
    assert.deepEqual(await t.set(KEY, TOKEN), { configured: true, member: 'Santi (@santi)' });
    assert.equal(statSync(join(dir, 'trello.json')).mode & 0o777, 0o600);
    const again = new TrelloService(dir, fakeTrello(calls));
    assert.equal(again.configured, true);
    assert.deepEqual(again.forget(), { configured: false });
    assert.equal(new TrelloService(dir, fakeTrello(calls)).configured, false);
  }),
);

test(
  'a card comes with its labels, to name its worktree',
  withDir(async (dir) => {
    const t = new TrelloService(dir, fakeTrello([]));
    await t.set(KEY, TOKEN);
    assert.deepEqual((await t.card(CARD)).labels, [{ name: 'Bug', color: 'red' }, { name: '', color: null }]);
  }),
);

test(
  'after a launch the card goes to the end of Doing, with a comment saying where it runs',
  withDir(async (dir) => {
    const calls: string[] = [];
    const t = new TrelloService(dir, fakeTrello(calls));
    await t.set(KEY, TOKEN);
    calls.length = 0;
    const out = await t.afterLaunch(await t.readCard(CARD), { hostName: 'Mac', space: 'twb', windowName: '3-login' });
    assert.deepEqual(out, { movedTo: '⚙ Doing', commented: true, warnings: [] });
    assert.ok(calls.includes(`PUT /1/cards/${CARD}?idList=doing&pos=bottom`));
    assert.ok(calls.some((c) => c.startsWith(`POST /1/cards/${CARD}/actions/comments?text=`) && decodeURIComponent(c.replace(/\+/g, ' ')).includes('Mac › twb · ventana «3-login»')));
  }),
);

test(
  'what fails after a launch is a warning: no Doing list, or a comment Trello refuses',
  withDir(async (dir) => {
    const t = new TrelloService(dir, fakeTrello([], { doing: false, failComment: true }));
    await t.set(KEY, TOKEN);
    const out = await t.afterLaunch(await t.readCard(CARD), { hostName: 'Mac', space: 'twb', windowName: 'x' });
    assert.equal(out.movedTo, undefined);
    assert.equal(out.commented, false);
    assert.equal(out.warnings.length, 2);
    const none = new TrelloService(join(dir, 'otro'), fakeTrello([]));
    await assert.rejects(none.boards(), TrelloSetupError);
  }),
);

test(
  'a card Trello cannot give is an error the launch carries on with, and after it nothing is moved or commented',
  withDir(async (dir) => {
    const calls: string[] = [];
    const t = new TrelloService(dir, fakeTrello(calls));
    await t.set(KEY, TOKEN);
    const read = await t.readCard('0123456789abcdef01234567');
    assert.equal(read.card, undefined);
    assert.ok(read.error);
    assert.equal((await t.readCard('no-es-un-id')).card, undefined);
    calls.length = 0;
    const out = await t.afterLaunch(read, { hostName: 'Mac', space: 'twb', windowName: 'x' });
    assert.equal(out.commented, false);
    assert.equal(out.movedTo, undefined);
    assert.equal(out.warnings.length, 1);
    assert.match(out.warnings[0], /^No se pudo leer la tarjeta: /);
    assert.deepEqual(calls, []);
  }),
);

test(
  'a card is found by its board and short number, for a Trello #N link',
  withDir(async (dir) => {
    const t = new TrelloService(dir, fakeTrello([]));
    await t.set(KEY, TOKEN);
    assert.equal(await t.cardUrl('0mGPkF10', '470'), 'https://trello.com/c/K9xY2abc');
    await assert.rejects(t.cardUrl('0mGPkF10', '9999'), (err: Error) => err instanceof TrelloNotFoundError && /No encuentro la tarjeta 9999/.test(err.message));
  }),
);

test(
  'a card address that is not a Trello page is refused',
  withDir(async (dir) => {
    const t = new TrelloService(dir, fakeTrello([]));
    await t.set(KEY, TOKEN);
    for (const n of ['471', '472']) await assert.rejects(t.cardUrl('0mGPkF10', n), /no es de Trello/, n);
  }),
);

test(
  'a board or a number that cannot be one is refused before asking Trello',
  withDir(async (dir) => {
    const calls: string[] = [];
    const t = new TrelloService(dir, fakeTrello(calls));
    await t.set(KEY, TOKEN);
    calls.length = 0;
    for (const [board, n] of [['../members/me', '1'], ['0mGPkF10', '1/../../x'], ['0mGPkF10', ''], ['0mGPkF10', '12345678'], ['', '1']])
      await assert.rejects(t.cardUrl(board, n), /No se reconoce/, `${board} ${n}`);
    assert.deepEqual(calls, []);
  }),
);

test(
  'without an account the lookup says to fix it in Ajustes › Trello',
  withDir(async (dir) => {
    await assert.rejects(new TrelloService(dir, fakeTrello([])).cardUrl('0mGPkF10', '470'), TrelloSetupError);
  }),
);
