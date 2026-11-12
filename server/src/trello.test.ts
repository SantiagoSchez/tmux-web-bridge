import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { TrelloService, TrelloSetupError } from './trello.js';

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
      return json({ id: CARD, name: 'Login', shortUrl: 'https://trello.com/c/abc', shortLink: 'abc', idShort: 3, idList: 'backlog', board: { id: 'b1', name: 'Tablero' } });
    }
    if (url.pathname === '/1/boards/b1/lists') {
      return json([{ id: 'backlog', name: '🗄 Backlog', closed: false }, ...(opts.doing === false ? [] : [{ id: 'doing', name: '⚙ Doing', closed: false }])]);
    }
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
  'after a launch the card goes to the end of Doing, with a comment saying where it runs',
  withDir(async (dir) => {
    const calls: string[] = [];
    const t = new TrelloService(dir, fakeTrello(calls));
    await t.set(KEY, TOKEN);
    calls.length = 0;
    const out = await t.afterLaunch(CARD, { hostName: 'Mac', space: 'twb', windowName: '3-login' });
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
    const out = await t.afterLaunch(CARD, { hostName: 'Mac', space: 'twb', windowName: 'x' });
    assert.equal(out.movedTo, undefined);
    assert.equal(out.commented, false);
    assert.equal(out.warnings.length, 2);
    const none = new TrelloService(join(dir, 'otro'), fakeTrello([]));
    await assert.rejects(none.boards(), TrelloSetupError);
  }),
);
