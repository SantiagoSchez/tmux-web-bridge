import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mock, test } from 'node:test';
import { createHash } from 'node:crypto';
import { fromAnotherSite, SessionStore } from './auth.js';

// ---------------------------------------------------------------- sessions alive

const DAY = 86_400_000;
const id = (token: string) => createHash('sha256').update(token).digest('hex');

/** A store of 2-day sessions in a temporary folder, on a clock the test moves (its saves never run). */
function store(t: { after: (fn: () => void) => void }) {
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_000_000 });
  const dir = mkdtempSync(join(tmpdir(), 'twb-auth-'));
  t.after(() => {
    mock.timers.reset();
    rmSync(dir, { recursive: true, force: true });
  });
  return new SessionStore(dir, 2);
}

test('a session is alive from its login until it is closed', (t) => {
  const sessions = store(t);
  const token = sessions.create({ ip: '100.64.0.7' });
  assert.equal(sessions.alive(id(token)), true);
  assert.equal(sessions.alive(id('otro')), false);
  sessions.revoke(id(token));
  assert.equal(sessions.alive(id(token)), false);
});

test('a session unused past its days is no longer alive, and asking does not keep it', (t) => {
  const sessions = store(t);
  const token = sessions.create({});
  mock.timers.setTime(1_000_000 + 2 * DAY - 1);
  assert.equal(sessions.alive(id(token)), true);
  mock.timers.setTime(1_000_000 + 2 * DAY + 1);
  assert.equal(sessions.alive(id(token)), false);
  assert.equal(sessions.check(token), null);
});

// ---------------------------------------------------------------- requests from another site

test('a request from an opaque origin, another site or another subdomain comes from another site', () => {
  assert.equal(fromAnotherSite({ origin: 'null' }, []), true);
  assert.equal(fromAnotherSite({ origin: 'null', 'sec-fetch-site': 'same-origin' }, []), true);
  assert.equal(fromAnotherSite({ 'sec-fetch-site': 'cross-site' }, []), true);
  assert.equal(fromAnotherSite({ 'sec-fetch-site': 'cross-site', origin: 'https://otro.example' }, ['http://localhost:5173']), true);
  assert.equal(fromAnotherSite({ 'sec-fetch-site': 'same-site' }, []), true);
  assert.equal(fromAnotherSite({ 'sec-fetch-site': 'same-site', origin: 'https://otro.hub.example' }, []), true);
});

test('the panel, the address bar and an allowed origin do not', () => {
  assert.equal(fromAnotherSite({ 'sec-fetch-site': 'same-origin', origin: 'https://hub.example' }, []), false);
  assert.equal(fromAnotherSite({ 'sec-fetch-site': 'same-site', origin: 'https://dev.hub.example' }, ['https://dev.hub.example']), false);
  assert.equal(fromAnotherSite({ 'sec-fetch-site': 'none' }, []), false);
  assert.equal(fromAnotherSite({}, []), false);
  assert.equal(fromAnotherSite({ 'sec-fetch-site': 'cross-site', origin: 'http://localhost:5173' }, ['http://localhost:5173']), false);
});
