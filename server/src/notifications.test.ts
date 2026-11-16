import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PushPayload } from '../../shared/types.js';
import type { Config } from './config.js';
import { ConnectionRegistry } from './connections.js';
import type { HostMonitor, PaneContext } from './host.js';
import { Notifier } from './notifications.js';
import type { PushService } from './push.js';

const MAC = 'https://push.example/mac';

/** A machine with one Claude pane (%1 in window @1) that answers every tmux call with nothing. */
function fakeHost(): HostMonitor {
  const host = {
    id: 'mac',
    name: 'Mac',
    refresh: async () => {},
    exec: { run: async () => '' },
    findPane: (paneId: string): PaneContext | null =>
      paneId === '%1'
        ? ({ host, session: { id: '$1', name: 'twb' }, window: { id: '@1', name: 'claude' }, pane: { id: '%1', state: 'done' } } as unknown as PaneContext)
        : null,
  };
  return host as unknown as HostMonitor;
}

/**
 * The push service at its network boundary: records what would be sent and to whom.
 * Endpoints in `gone` are subscribed but the push service no longer takes them.
 */
function fakePush(subscribed: string[], gone: string[] = []) {
  const sent: { payload: PushPayload; only?: readonly string[] }[] = [];
  const push = {
    has: (e: string) => subscribed.includes(e),
    send: async (payload: PushPayload, only?: readonly string[]) => {
      sent.push({ payload, only });
      return (only ?? subscribed).filter((e) => subscribed.includes(e) && !gone.includes(e)).length;
    },
  };
  return { push: push as unknown as PushService, sent };
}

function notifier(conns: ConnectionRegistry, push: PushService): Notifier {
  return new Notifier({ fallbackDelayMs: 4000 } as Config, new Map([['mac', fakeHost()]]), push, conns);
}

const done = { host: 'mac', pane: '%1', state: 'done' as const, title: '✅ claude [twb]', message: 'Listo' };

test('a pane finishing while you work at the Mac with twb hidden notifies only the Mac', async () => {
  const conns = new ConnectionRegistry();
  const mac = conns.add({});
  conns.update(mac.id, { visible: false, present: true });
  conns.setPushEndpoint(mac.id, MAC);
  const { push, sent } = fakePush([MAC, 'https://push.example/phone']);

  assert.deepEqual(await notifier(conns, push).onScriptNotify(done), { pushed: true });
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].only, [MAC]);
});

test('a pane finishing while twb is on screen at the device you are using notifies nobody', async () => {
  const conns = new ConnectionRegistry();
  const mac = conns.add({});
  conns.update(mac.id, { visible: true, present: true });
  conns.setPushEndpoint(mac.id, MAC);
  const { push, sent } = fakePush([MAC]);

  assert.deepEqual(await notifier(conns, push).onScriptNotify(done), { pushed: false, reason: 'present' });
  assert.equal(sent.length, 0);
});

test('when the device you are at no longer takes pushes, every device is notified instead', async () => {
  const conns = new ConnectionRegistry();
  const mac = conns.add({});
  conns.update(mac.id, { visible: false, present: true });
  conns.setPushEndpoint(mac.id, MAC);
  const { push, sent } = fakePush([MAC, 'https://push.example/phone'], [MAC]);

  assert.deepEqual(await notifier(conns, push).onScriptNotify(done), { pushed: true });
  assert.deepEqual(sent.map((s) => s.only), [[MAC], undefined]);
});

test('a notice for a pane the hub does not know also goes only to the device you are at', async () => {
  const conns = new ConnectionRegistry();
  const mac = conns.add({});
  conns.update(mac.id, { visible: false, present: true });
  conns.setPushEndpoint(mac.id, MAC);
  const { push, sent } = fakePush([MAC, 'https://push.example/phone']);

  assert.deepEqual(await notifier(conns, push).onScriptNotify({ ...done, pane: '%9' }), { pushed: true });
  assert.deepEqual(sent.map((s) => s.only), [[MAC]]);
});

test('a pane icon turning ✅ with no notice from its kit also goes only to the device you are at', async () => {
  const conns = new ConnectionRegistry();
  const mac = conns.add({});
  conns.update(mac.id, { visible: false, present: true });
  conns.setPushEndpoint(mac.id, MAC);
  const { push, sent } = fakePush([MAC, 'https://push.example/phone']);
  const host = fakeHost();
  const n = new Notifier({ fallbackDelayMs: 0 } as Config, new Map([['mac', host]]), push, conns);

  const ctx = host.findPane('%1');
  assert.ok(ctx);
  n.onTransition({ ...ctx, from: 'busy', to: 'done' });
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(sent.map((s) => s.only), [[MAC]]);
});

test('a pane finishing while you are at no device notifies every device', async () => {
  const conns = new ConnectionRegistry();
  const { push, sent } = fakePush([MAC, 'https://push.example/phone']);

  assert.deepEqual(await notifier(conns, push).onScriptNotify(done), { pushed: true });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].only, undefined);
});
