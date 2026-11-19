import assert from 'node:assert/strict';
import { test } from 'node:test';
import { limitSuggestions, parseScheduled, scheduledProblem } from '../../shared/scheduled.js';
import type { ScheduledMessageInput } from '../../shared/types.js';

/** 2026-11-17 is a Tuesday; the times are the local clock, as the panel shows them. */
const at = (day: number, hh: number, mm = 0, ss = 0) => new Date(2026, 10, day, hh, mm, ss).getTime();
const TUE = 17;
const WED = 18;
const THU = 19;

const now = new Date(at(TUE, 11));

const valid: ScheduledMessageInput = {
  name: 'Repasar tests',
  host: 'drangleic',
  target: { folder: '~/Proyectos/twb' },
  prompt: 'Repasa los tests que fallan',
  worktree: false,
  skipPermissions: false,
  at: at(TUE, 15),
};

// ---------------------------------------------------------------- checking a message

test('a complete message with a future time is accepted', () => {
  assert.equal(scheduledProblem(valid, now), null);
});

test('a message without a name, folder or prompt is refused, saying what is missing', () => {
  assert.equal(scheduledProblem({ ...valid, name: '  \n ' }, now), 'Falta el nombre');
  assert.equal(scheduledProblem({ ...valid, host: '' }, now), 'Falta la máquina');
  assert.equal(scheduledProblem({ ...valid, target: { folder: '' } }, now), 'Falta la carpeta');
  assert.equal(scheduledProblem({ ...valid, prompt: '   ' }, now), 'Falta el prompt');
  assert.equal(scheduledProblem({ ...valid, prompt: 'x'.repeat(10_001) }, now), 'El prompt es demasiado largo');
  assert.equal(scheduledProblem(null, now), 'Mensaje programado inválido');
});

test('a time that is not in the future is refused', () => {
  assert.equal(scheduledProblem({ ...valid, at: at(TUE, 9) }, now), 'Esa hora ya ha pasado');
  assert.equal(scheduledProblem({ ...valid, at: now.getTime() }, now), 'Esa hora ya ha pasado');
  assert.equal(scheduledProblem({ ...valid, at: Number.NaN }, now), 'Falta la fecha y la hora');
});

test('with a worktree, an invalid base branch is refused; without one the base is dropped', () => {
  assert.match(scheduledProblem({ ...valid, worktree: true, base: 'a..b' }, now) ?? '', /rama/);
  assert.equal(scheduledProblem({ ...valid, worktree: true, base: 'master' }, now), null);
  const kept = parseScheduled({ ...valid, worktree: false, base: 'master' }, now);
  assert.equal(typeof kept === 'object' && 'base' in kept, false);
});

test('the kept message has its name cleaned and loses the keys it does not know', () => {
  const kept = parseScheduled({ ...valid, name: ' Repasar\ttests ', prompt: ' Repasa ', extra: 1 }, now);
  assert.deepEqual(kept, { ...valid, name: 'Repasar tests', prompt: 'Repasa' });
});

// ---------------------------------------------------------------- suggested times

test('suggests 1 day, 12 h and 3 h before the weekly reset, then the 5-hour reset', () => {
  const s = limitSuggestions(now.getTime(), at(TUE, 15, 40), at(THU, 12));
  assert.deepEqual(
    s.map((x) => x.at),
    [at(WED, 12), at(THU, 0), at(THU, 9), at(TUE, 15, 40)],
  );
  assert.deepEqual(
    s.map((x) => x.label),
    ['1 día antes del reinicio semanal', '12 h antes del reinicio semanal', '3 h antes del reinicio semanal', 'Cuando se reinicie el límite de 5 h'],
  );
});

test('only the times still to come are suggested', () => {
  const s = limitSuggestions(now.getTime(), at(TUE, 9), at(TUE, 13));
  assert.deepEqual(s, []);
  assert.deepEqual(
    limitSuggestions(now.getTime(), null, at(TUE, 16)).map((x) => x.at),
    [at(TUE, 13)],
  );
});

test('with no reset known there is nothing to suggest', () => {
  assert.deepEqual(limitSuggestions(now.getTime(), null, null), []);
});

test('suggested times fall on the whole minute, as a date and time field holds them', () => {
  const s = limitSuggestions(now.getTime(), at(TUE, 15, 40, 37), null);
  assert.deepEqual(s.map((x) => x.at), [at(TUE, 15, 40)]);
});
