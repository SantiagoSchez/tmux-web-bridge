import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_QUIET_HOURS, describeQuietHours, isQuietAt, quietHoursProblem, sanitizeQuietHours } from '../../shared/quiet-hours.js';
import type { QuietHours } from '../../shared/types.js';

/** 2026-11-20 is a Friday; the times are the local clock, as the hub reads them. */
const at = (day: number, hh: number, mm = 0) => new Date(2026, 10, day, hh, mm);
const FRI = 20;
const SAT = 21;
const SUN = 22;
const MON = 23;
const TUE = 24;

const fridayNights: QuietHours = { enabled: true, from: '22:00', to: '08:00', days: [5], allDay: [] };

test('a window that crosses midnight belongs to the day it starts on', () => {
  assert.equal(isQuietAt(fridayNights, at(FRI, 22, 0)), true);
  assert.equal(isQuietAt(fridayNights, at(SAT, 3, 0)), true);
  assert.equal(isQuietAt(fridayNights, at(SAT, 7, 59)), true);
});

test('the minute before the window starts and the minute it ends are not quiet', () => {
  assert.equal(isQuietAt(fridayNights, at(FRI, 21, 59)), false);
  assert.equal(isQuietAt(fridayNights, at(SAT, 8, 0)), false);
});

test('the night after a day the window does not list is not quiet', () => {
  assert.equal(isQuietAt(fridayNights, at(SAT, 23, 0)), false);
  assert.equal(isQuietAt(fridayNights, at(SUN, 3, 0)), false);
  assert.equal(isQuietAt(fridayNights, at(FRI, 3, 0)), false);
});

test('a window inside one day covers only that stretch of its days', () => {
  const siesta: QuietHours = { enabled: true, from: '14:00', to: '16:00', days: [0, 1, 2, 3, 4, 5, 6], allDay: [] };
  assert.equal(isQuietAt(siesta, at(TUE, 15, 0)), true);
  assert.equal(isQuietAt(siesta, at(TUE, 13, 59)), false);
  assert.equal(isQuietAt(siesta, at(TUE, 16, 0)), false);
});

test('a whole quiet day lasts from 00:00 to 23:59 and does not reach the next day', () => {
  const sundays: QuietHours = { enabled: true, from: '22:00', to: '08:00', days: [1, 2, 3, 4, 5], allDay: [0] };
  assert.equal(isQuietAt(sundays, at(SUN, 0, 0)), true);
  assert.equal(isQuietAt(sundays, at(SUN, 15, 0)), true);
  assert.equal(isQuietAt(sundays, at(SUN, 23, 59)), true);
  const onlySundays: QuietHours = { ...sundays, days: [] };
  assert.equal(isQuietAt(onlySundays, at(MON, 0, 30)), false);
});

test('a schedule that is off silences nothing', () => {
  assert.equal(isQuietAt({ ...fridayNights, enabled: false, allDay: [6] }, at(SAT, 3, 0)), false);
});

test('a window that starts and ends at the same minute is refused', () => {
  assert.equal(quietHoursProblem({ ...fridayNights, from: '08:00', to: '08:00' }), 'La franja no puede empezar y acabar a la misma hora');
  assert.equal(sanitizeQuietHours({ ...fridayNights, from: '08:00', to: '08:00' }), null);
});

test('times that are not HH:MM and days outside 0-6 are refused', () => {
  assert.match(quietHoursProblem({ ...fridayNights, from: '8:00' }) ?? '', /HH:MM/);
  assert.match(quietHoursProblem({ ...fridayNights, to: '24:00' }) ?? '', /HH:MM/);
  assert.match(quietHoursProblem({ ...fridayNights, days: [7] }) ?? '', /día/);
  assert.match(quietHoursProblem({ ...fridayNights, allDay: [1.5] }) ?? '', /día/);
  assert.match(quietHoursProblem({ ...fridayNights, enabled: 'yes' }) ?? '', /activ/);
  assert.notEqual(quietHoursProblem(null), null);
});

test('a valid schedule is kept with its days deduplicated and sorted, and unknown keys dropped', () => {
  assert.deepEqual(sanitizeQuietHours({ enabled: false, from: '23:30', to: '07:15', days: [5, 1, 5], allDay: [6, 0], extra: 1 }), {
    enabled: false,
    from: '23:30',
    to: '07:15',
    days: [1, 5],
    allDay: [0, 6],
  });
});

test('a schedule with no day at all is valid and the summary says it silences nothing', () => {
  const none: QuietHours = { enabled: true, from: '22:00', to: '08:00', days: [], allDay: [] };
  assert.equal(quietHoursProblem(none), null);
  assert.equal(isQuietAt(none, at(SAT, 3, 0)), false);
  assert.match(describeQuietHours(none), /ningún día/);
});

test('the summary names the window, its days and the whole days', () => {
  assert.equal(describeQuietHours({ enabled: true, from: '22:00', to: '08:00', days: [1, 2, 3, 4, 5], allDay: [0, 6] }), 'Laborables de 22:00 a 08:00 y fines de semana todo el día');
  assert.equal(describeQuietHours(DEFAULT_QUIET_HOURS), 'Cada día de 22:00 a 08:00');
});
