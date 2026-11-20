import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeMute, isMutedAt, isMuteHours, muteUntil, quietReason, sanitizeMute } from '../../shared/mute.js';
import type { QuietHours } from '../../shared/types.js';

/** Local clock times on Friday 2026-11-20, as epoch milliseconds. */
const at = (hh: number, mm = 0, day = 20) => new Date(2026, 10, day, hh, mm).getTime();

test('no mute is never muted', () => {
  assert.equal(isMutedAt(null, at(15)), false);
});

test('a mute with an end holds until that minute and not at it', () => {
  const mute = { until: at(17) };
  assert.equal(isMutedAt(mute, at(16, 59)), true);
  assert.equal(isMutedAt(mute, at(17)), false);
  assert.equal(isMutedAt(mute, at(18)), false);
});

test('a mute until further notice holds days later', () => {
  assert.equal(isMutedAt({ until: null }, at(9, 0, 23)), true);
});

test('muting for some hours ends that many hours from now', () => {
  assert.deepEqual(muteUntil(2, at(15)), { until: at(17) });
  assert.deepEqual(muteUntil(5, at(22)), { until: at(3, 0, 21) });
});

test('muting with no hours lasts until further notice', () => {
  assert.deepEqual(muteUntil(null, at(15)), { until: null });
});

test('the hub takes only the offered durations', () => {
  assert.equal(isMuteHours(2), true);
  for (const h of [0, 4, 6, 2.5, -1, '2', null, undefined]) assert.equal(isMuteHours(h), false);
});

test('a saved mute loads as it was, without other keys', () => {
  assert.equal(sanitizeMute(null), null);
  assert.deepEqual(sanitizeMute({ until: null }), { until: null });
  assert.deepEqual(sanitizeMute({ until: at(17), by: 'phone' }), { until: at(17) });
});

test('a malformed saved mute loads as not muted', () => {
  for (const raw of [undefined, true, 'until', {}, { until: '17:00' }, { until: -5 }, { until: Number.NaN }, { until: Number.POSITIVE_INFINITY }]) {
    assert.equal(sanitizeMute(raw), null, JSON.stringify(raw));
  }
});

test('the bell says until when, on the clock of the device that shows it', () => {
  assert.equal(describeMute({ until: null }, at(15)), 'Silenciadas hasta nuevo aviso');
  assert.equal(describeMute({ until: at(18) }, at(15)), 'Silenciadas hasta las 18:00');
  assert.equal(describeMute({ until: at(9, 5) }, at(8)), 'Silenciadas hasta las 09:05');
});

test('a mute that ends after midnight says it ends tomorrow', () => {
  assert.equal(describeMute({ until: at(2, 0, 21) }, at(22)), 'Silenciadas hasta mañana a las 02:00');
});

/** 22:00 to 08:00 every night, on. */
const nights: QuietHours = { enabled: true, from: '22:00', to: '08:00', days: [0, 1, 2, 3, 4, 5, 6], allDay: [] };
const date = (hh: number) => new Date(at(hh));

test('pushes go out with no mute and outside the quiet schedule', () => {
  assert.equal(quietReason(null, nights, date(15)), null);
});

test('a mute holds pushes back outside the quiet schedule', () => {
  assert.equal(quietReason({ until: null }, nights, date(15)), 'muted');
});

test('the quiet schedule holds pushes back with no mute, or once the mute ended', () => {
  assert.equal(quietReason(null, nights, date(23)), 'quiet hours');
  assert.equal(quietReason({ until: at(22) }, nights, date(23)), 'quiet hours');
});

test('muted inside the quiet schedule, the reason is the mute', () => {
  assert.equal(quietReason({ until: null }, nights, date(23)), 'muted');
});
