import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
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
 * Endpoints in `gone` are subscribed but the push service no longer takes them;
 * `quiet`: it is inside the quiet schedule.
 */
function fakePush(subscribed: string[], gone: string[] = [], quiet = false) {
  const sent: { payload: PushPayload; only?: readonly string[] }[] = [];
  const push = {
    quiet: () => quiet,
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

/** The `[push]` lines the hub writes while `run` runs: the log is the only trace of a notice held back. */
async function pushLog(t: TestContext, run: () => Promise<unknown>): Promise<string[]> {
  const log = t.mock.method(console, 'log', () => {});
  await run();
  return log.mock.calls.map((c) => String(c.arguments[0])).filter((l) => l.startsWith('[push]'));
}

test('a notice the machine reports as seen is not pushed and says so in the log', async (t) => {
  const { push, sent } = fakePush([MAC]);
  const n = notifier(new ConnectionRegistry(), push);

  const lines = await pushLog(t, () => n.onScriptNotify({ ...done, viewed: true, title: '', message: '' }));
  assert.equal(sent.length, 0);
  assert.deepEqual(lines, ['[push] ✅ claude [twb]: no se envía, ya lo has visto en la terminal']);
});

test('a notice for a pane open in a visible web tab is not pushed and says so in the log', async (t) => {
  const conns = new ConnectionRegistry();
  const phone = conns.add({});
  conns.update(phone.id, { visible: true, view: { host: 'mac', window: '@1', pane: '%1' } });
  const { push, sent } = fakePush([MAC]);
  const n = notifier(conns, push);

  const lines = await pushLog(t, () => n.onScriptNotify(done));
  assert.equal(sent.length, 0);
  assert.deepEqual(lines, ['[push] ✅ claude [twb]: no se envía, lo tienes abierto en la web']);
});

test('a notice seen at the terminal for a pane the hub does not know names its machine in the log', async (t) => {
  const { push, sent } = fakePush([MAC]);
  const n = notifier(new ConnectionRegistry(), push);

  const lines = await pushLog(t, () => n.onScriptNotify({ ...done, pane: '%9', viewed: true, title: '', message: '' }));
  assert.equal(sent.length, 0);
  assert.deepEqual(lines, ['[push] ✅ Mac: no se envía, ya lo has visto en la terminal']);
});

test('a notice from a machine the panel does not have is not pushed and says so in the log', async (t) => {
  const { push, sent } = fakePush([MAC]);
  const n = notifier(new ConnectionRegistry(), push);

  const lines = await pushLog(t, () => n.onScriptNotify({ ...done, host: 'portatil-viejo' }));
  assert.equal(sent.length, 0);
  assert.deepEqual(lines, ['[push] ✅ portatil-viejo: no se envía, la máquina portatil-viejo no está en el panel']);
});

test('a notice inside the quiet schedule is not pushed and says so in the log', async (t) => {
  const { push, sent } = fakePush([MAC], [], true);
  const n = notifier(new ConnectionRegistry(), push);

  let result: unknown;
  const lines = await pushLog(t, async () => (result = await n.onScriptNotify(done)));
  assert.deepEqual(result, { pushed: false, reason: 'quiet hours' });
  assert.equal(sent.length, 0);
  assert.deepEqual(lines, ['[push] ✅ claude [twb]: no se envía, es horario de descanso']);
});

test('the same notice outside the quiet schedule is pushed', async () => {
  const { push, sent } = fakePush([MAC], [], false);

  assert.deepEqual(await notifier(new ConnectionRegistry(), push).onScriptNotify(done), { pushed: true });
  assert.equal(sent.length, 1);
});

test('a pane icon turning ✅ inside the quiet schedule pushes nothing', async (t) => {
  const { push, sent } = fakePush([MAC], [], true);
  const host = fakeHost();
  const n = new Notifier({ fallbackDelayMs: 0 } as Config, new Map([['mac', host]]), push, new ConnectionRegistry());

  const ctx = host.findPane('%1');
  assert.ok(ctx);
  const lines = await pushLog(t, async () => {
    n.onTransition({ ...ctx, from: 'busy', to: 'done' });
    await new Promise((r) => setTimeout(r, 20));
  });
  assert.equal(sent.length, 0);
  assert.deepEqual(lines, ['[push] ✅ claude [twb]: no se envía, es horario de descanso']);
});
