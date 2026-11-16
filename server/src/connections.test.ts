import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConnectionRegistry } from './connections.js';

const MAC = 'https://push.example/mac';
const subscribed = (endpoints: string[]) => (e: string) => endpoints.includes(e);

/** A connection of the app at a device: whether its window is on screen and whether you are working there. */
function connect(conns: ConnectionRegistry, opts: { visible: boolean; present: boolean; endpoint?: string }) {
  const c = conns.add({});
  conns.update(c.id, { visible: opts.visible, present: opts.present });
  if (opts.endpoint) conns.setPushEndpoint(c.id, opts.endpoint);
  return c;
}

test('with nobody at a device, a push goes to every device', () => {
  const conns = new ConnectionRegistry();
  connect(conns, { visible: false, present: false, endpoint: MAC });
  assert.deepEqual(conns.pushRoute(subscribed([MAC])), { to: 'all' });
});

test('with the app on screen at the device you are using, no push is sent', () => {
  const conns = new ConnectionRegistry();
  const mac = connect(conns, { visible: true, present: true, endpoint: MAC });
  assert.deepEqual(conns.pushRoute(subscribed([MAC])), { to: 'none', at: conns.get(mac.id) });
});

test('with the app hidden at the device you are using, the push goes only to that device', () => {
  const conns = new ConnectionRegistry();
  const mac = connect(conns, { visible: false, present: true, endpoint: MAC });
  connect(conns, { visible: false, present: false, endpoint: 'https://push.example/phone' });
  assert.deepEqual(conns.pushRoute(subscribed([MAC, 'https://push.example/phone'])), { to: 'devices', endpoints: [MAC], at: conns.get(mac.id) });
});

test('another window of the app on screen at that device still silences the push', () => {
  const conns = new ConnectionRegistry();
  connect(conns, { visible: false, present: true, endpoint: MAC });
  const tab = connect(conns, { visible: true, present: true, endpoint: MAC });
  assert.deepEqual(conns.pushRoute(subscribed([MAC])), { to: 'none', at: conns.get(tab.id) });
});

test('when the device you are using cannot get pushes, they go to every device', () => {
  const conns = new ConnectionRegistry();
  connect(conns, { visible: false, present: true });
  connect(conns, { visible: false, present: true, endpoint: 'https://push.example/forgotten' });
  assert.deepEqual(conns.pushRoute(subscribed([MAC])), { to: 'all' });
});

test('once a device turns its notifications off, pushes go to every device again', () => {
  const conns = new ConnectionRegistry();
  const mac = connect(conns, { visible: false, present: true, endpoint: MAC });
  conns.setPushEndpoint(mac.id, null);
  assert.deepEqual(conns.pushRoute(subscribed([MAC])), { to: 'all' });
});

test('the device named is the one that gets the push', () => {
  const conns = new ConnectionRegistry();
  connect(conns, { visible: false, present: true });
  const mac = connect(conns, { visible: false, present: true, endpoint: MAC });
  const route = conns.pushRoute(subscribed([MAC]));
  assert.equal(route.to === 'devices' && route.at.id, mac.id);
});

test('the push endpoint is not shown to the other devices', () => {
  const conns = new ConnectionRegistry();
  connect(conns, { visible: false, present: true, endpoint: MAC });
  assert.doesNotMatch(JSON.stringify(conns.list()), /push\.example/);
});
