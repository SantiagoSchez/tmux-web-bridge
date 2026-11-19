import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import webpush from 'web-push';
import type { Config } from './config.js';
import { PushService } from './push.js';

const PHONE = { endpoint: 'https://push.example/phone', keys: { p256dh: 'p', auth: 'a' } };
const payload = { title: '⚠️ copia nocturna', body: 'La automatización no se ha podido lanzar', tag: 'automation:1', url: '/' };

/**
 * A push service with one subscribed phone, in a temporary dataDir, whose Web Push
 * requests (the network boundary) are recorded instead of sent; `quiet` is the schedule.
 */
function service(t: TestContext, quiet: boolean) {
  const dir = mkdtempSync(join(tmpdir(), 'twb-push-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const sent: string[] = [];
  t.mock.method(webpush, 'sendNotification', async (sub: { endpoint: string }) => {
    sent.push(sub.endpoint);
    return { statusCode: 201, body: '', headers: {} };
  });
  const push = new PushService({ dataDir: dir, vapidSubject: 'mailto:twb@example.com' } as Config, () => quiet);
  push.subscribe(PHONE, {});
  const log = t.mock.method(console, 'log', () => {});
  const lines = () => log.mock.calls.map((c) => String(c.arguments[0])).filter((l) => l.startsWith('[push]'));
  return { push, sent, lines };
}

test('inside the quiet schedule nothing is sent, and the log says why', async (t) => {
  const { push, sent, lines } = service(t, true);

  assert.equal(await push.send(payload), 0);
  assert.deepEqual(sent, []);
  assert.deepEqual(lines(), ['[push] ⚠️ copia nocturna: no se envía, es horario de descanso']);
});

test('the test notification goes out even inside the quiet schedule', async (t) => {
  const { push, sent } = service(t, true);

  assert.equal(await push.send(payload, undefined, { evenWhenQuiet: true }), 1);
  assert.deepEqual(sent, [PHONE.endpoint]);
});

test('outside the quiet schedule every subscribed device gets the push', async (t) => {
  const { push, sent, lines } = service(t, false);

  assert.equal(await push.send(payload), 1);
  assert.deepEqual(sent, [PHONE.endpoint]);
  assert.deepEqual(lines(), []);
});
