import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StaleCache, type StaleRead } from '../../shared/stale-cache.js';

/** The load a read waits for; fails the test when the read had a value already. */
function pendingOf<T>(read: StaleRead<T>): Promise<T | undefined> {
  if (read.ready) assert.fail(`expected a pending read, got ${JSON.stringify(read.value)}`);
  return read.pending;
}

/** A cache on a clock the test moves, and a loader that counts its calls and answers what it is told. */
function setup() {
  let now = 0;
  const cache = new StaleCache<string>(1000, () => now);
  const calls: string[] = [];
  const loader = (answer: string | Error) => () => {
    calls.push(answer instanceof Error ? 'fail' : answer);
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  };
  return { cache, calls, loader, tick: (ms: number) => (now += ms) };
}

test('the first look waits for the load, and a fresh value answers at once without loading again', async () => {
  const { cache, calls, loader } = setup();
  assert.equal(await pendingOf(cache.get('k', loader('a'))), 'a');
  assert.deepEqual(cache.get('k', loader('b')), { ready: true, value: 'a' });
  assert.deepEqual(calls, ['a']);
});

test('an expired value still answers at once while one reload replaces it', async () => {
  const { cache, calls, loader, tick } = setup();
  await pendingOf(cache.get('k', loader('a')));
  tick(1001);
  assert.deepEqual(cache.get('k', loader('b')), { ready: true, value: 'a' });
  // A second look while the reload is on its way does not start another one.
  assert.deepEqual(cache.get('k', loader('c')), { ready: true, value: 'a' });
  await Promise.resolve();
  assert.deepEqual(cache.get('k', loader('d')), { ready: true, value: 'b' });
  assert.deepEqual(calls, ['a', 'b']);
});

test('a failed reload keeps the old value, and the next look tries again', async () => {
  const { cache, calls, loader, tick } = setup();
  await pendingOf(cache.get('k', loader('a')));
  tick(1001);
  assert.deepEqual(cache.get('k', loader(new Error('down'))), { ready: true, value: 'a' });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(cache.get('k', loader('b')), { ready: true, value: 'a' });
  await Promise.resolve();
  assert.deepEqual(cache.get('k', loader('c')), { ready: true, value: 'b' });
  assert.deepEqual(calls, ['a', 'fail', 'b']);
});

test('a first load that fails answers nothing, and the next look loads again', async () => {
  const { cache, calls, loader } = setup();
  assert.equal(await pendingOf(cache.get('k', loader(new Error('down')))), undefined);
  assert.equal(await pendingOf(cache.get('k', loader('a'))), 'a');
  assert.deepEqual(calls, ['fail', 'a']);
});

test('keys are kept apart', async () => {
  const { cache, loader } = setup();
  await pendingOf(cache.get('one', loader('a')));
  assert.equal(await pendingOf(cache.get('two', loader('b'))), 'b');
  assert.deepEqual(cache.get('one', loader('c')), { ready: true, value: 'a' });
});
