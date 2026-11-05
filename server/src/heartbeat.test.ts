import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { Heartbeat } from './heartbeat.js';

class FakeSocket extends EventEmitter {
  pings = 0;
  terminated = false;
  /** Answers each ping, like a browser that is still there. */
  constructor(private readonly answers: boolean) {
    super();
  }
  ping(): void {
    this.pings++;
    if (this.answers) this.emit('pong');
  }
  terminate(): void {
    this.terminated = true;
    this.emit('close');
  }
}

test('a socket that answers the pings stays', () => {
  const hb = new Heartbeat(60_000);
  const ws = new FakeSocket(true);
  hb.watch(ws);
  for (let i = 0; i < 5; i++) hb.tick();
  assert.equal(ws.pings, 5);
  assert.equal(ws.terminated, false);
  assert.equal(hb.size, 1);
});

test('a socket that stops answering is cut on the tick after its unanswered ping', () => {
  const hb = new Heartbeat(60_000);
  const ws = new FakeSocket(false);
  hb.watch(ws);
  hb.tick();
  assert.equal(ws.terminated, false, 'one ping without answer yet');
  hb.tick();
  assert.equal(ws.terminated, true);
  assert.equal(hb.size, 0);
});

test('a socket that closes on its own is forgotten', () => {
  const hb = new Heartbeat(60_000);
  const ws = new FakeSocket(true);
  hb.watch(ws);
  ws.emit('close');
  assert.equal(hb.size, 0);
  hb.tick();
  assert.equal(ws.pings, 0);
});
