// The quiet schedule (Ajustes › Notificaciones): when the hub sends no push notification.
// A window on some days of the week, which belongs to the day it starts on when it
// crosses midnight, plus days silenced entirely. Times are the local clock: the hub's TZ
// when the hub decides, the same rule the panel uses to describe it.

import { describeDays } from './schedule.js';
import type { QuietHours } from './types.js';

/** Off, 22:00 to 08:00 every night, no whole days. */
export const DEFAULT_QUIET_HOURS: QuietHours = { enabled: false, from: '22:00', to: '08:00', days: [0, 1, 2, 3, 4, 5, 6], allDay: [] };

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

const isDayList = (v: unknown): v is number[] => Array.isArray(v) && v.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);

/** Why a schedule cannot be kept, in Spanish for the panel, or null if it is fine. */
export function quietHoursProblem(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return 'Falta el horario de descanso';
  const q = raw as Record<string, unknown>;
  if (typeof q.enabled !== 'boolean') return 'Falta si está activado';
  if (typeof q.from !== 'string' || !TIME.test(q.from) || typeof q.to !== 'string' || !TIME.test(q.to)) return 'Las horas tienen que ser HH:MM';
  if (q.from === q.to) return 'La franja no puede empezar y acabar a la misma hora';
  if (!isDayList(q.days) || !isDayList(q.allDay)) return 'Algún día no es válido';
  return null;
}

/** The schedule as kept (days once each, in order, no other keys), or null when it is not valid. */
export function sanitizeQuietHours(raw: unknown): QuietHours | null {
  if (quietHoursProblem(raw)) return null;
  const q = raw as QuietHours;
  const days = (list: number[]) => [...new Set(list)].sort((a, b) => a - b);
  return { enabled: q.enabled, from: q.from, to: q.to, days: days(q.days), allDay: days(q.allDay) };
}

/**
 * What a control of Ajustes › Notificaciones saves: `patch` over the hub's schedule
 * (`current`, as it is when the control fires), with the times as typed in the fields
 * when that makes a valid schedule. A refused time change saves nothing and says why;
 * another control then saves with the hub's times.
 */
export function editQuietHours(current: QuietHours, typed: { from: string; to: string }, patch: Partial<QuietHours>): { save: QuietHours | null; problem: string | null } {
  const withTyped = { ...current, ...typed, ...patch };
  const problem = quietHoursProblem(withTyped);
  if (!problem) return { save: sanitizeQuietHours(withTyped), problem: null };
  if ('from' in patch || 'to' in patch) return { save: null, problem };
  const withHubTimes = { ...current, ...patch };
  const fallback = quietHoursProblem(withHubTimes);
  return fallback ? { save: null, problem: fallback } : { save: sanitizeQuietHours(withHubTimes), problem: null };
}

/** Whether no push goes out at `date` (read on its local clock). */
export function isQuietAt(q: QuietHours, date: Date): boolean {
  if (!q.enabled || quietHoursProblem(q)) return false;
  const day = date.getDay();
  if (q.allDay.includes(day)) return true;
  const now = date.getHours() * 60 + date.getMinutes();
  const from = minutes(q.from);
  const to = minutes(q.to);
  if (from < to) return q.days.includes(day) && now >= from && now < to;
  // Crosses midnight: tonight's start, or the end of the window that started yesterday.
  return (q.days.includes(day) && now >= from) || (q.days.includes((day + 6) % 7) && now < to);
}

/** In words: «Laborables de 22:00 a 08:00 y fines de semana todo el día», «No silencia ningún día». */
export function describeQuietHours(q: QuietHours): string {
  const parts: string[] = [];
  if (q.days.length) parts.push(`${describeDays(q.days)} de ${q.from} a ${q.to}`);
  if (q.allDay.length) parts.push(`${describeDays(q.allDay)} todo el día`);
  if (!parts.length) return 'No silencia ningún día';
  const text = parts.join(' y ');
  return `${text[0].toUpperCase()}${text.slice(1)}`;
}
