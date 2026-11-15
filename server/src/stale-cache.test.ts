import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StaleCache } from '../../shared/stale-cache.js';

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
  const first = cache.get('k', loader('a'));
  assert.equal(first.ready, false);
  assert.equal(await (first.ready ? undefined : first.pending), 'a');
  assert.deepEqual(cache.get('k', loader('b')), { ready: true, value: 'a' });
  assert.deepEqual(calls, ['a']);
});

test('an expired value still answers at once while one reload replaces it', async () => {
  const { cache, calls, loader, tick } = setup();
  await (cache.get('k', loader('a')) as { pending: Promise<unknown> }).pending;
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
  await (cache.get('k', loader('a')) as { pending: Promise<unknown> }).pending;
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
  const first = cache.get('k', loader(new Error('down')));
  assert.equal(await (first.ready ? 'ready' : first.pending), undefined);
  const second = cache.get('k', loader('a'));
  assert.equal(second.ready, false);
  assert.equal(await (second.ready ? undefined : second.pending), 'a');
  assert.deepEqual(calls, ['fail', 'a']);
});

test('keys are kept apart', async () => {
  const { cache, loader } = setup();
  await (cache.get('one', loader('a')) as { pending: Promise<unknown> }).pending;
  assert.equal(cache.get('two', loader('b')).ready, false);
  assert.deepEqual(cache.get('one', loader('c')), { ready: true, value: 'a' });
});
