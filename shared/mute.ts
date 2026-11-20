// The mute of the top bar's bell: no push notification goes out for 1, 2, 3 or 5 hours, or
// until further notice, on every device. The hub sets its end on its own clock; the panel
// reads it to show the bell and say until when.

import { isQuietAt } from './quiet-hours.js';
import type { NotificationMute, QuietHours } from './types.js';

const HOUR = 3_600_000;

/** Why pushes are held back right now: the top bar's bell, or the quiet schedule (Ajustes › Notificaciones). */
export type QuietReason = 'muted' | 'quiet hours';

/** Why no push goes out at `date`, or null when they go out. The mute comes first, so the log names it. */
export function quietReason(mute: NotificationMute | null, quietHours: QuietHours, date: Date): QuietReason | null {
  if (isMutedAt(mute, date.getTime())) return 'muted';
  return isQuietAt(quietHours, date) ? 'quiet hours' : null;
}

/** Whether no push goes out at `now` (epoch ms). */
export function isMutedAt(mute: NotificationMute | null, now: number): boolean {
  return mute !== null && (mute.until === null || now < mute.until);
}

/** The durations the bell offers, in hours. */
export const MUTE_HOURS = [1, 2, 3, 5] as const;
export type MuteHours = (typeof MUTE_HOURS)[number];

/** The mute that `hours` from `now` gives (null: until further notice). */
export function muteUntil(hours: MuteHours | null, now: number): NotificationMute {
  return { until: hours === null ? null : now + hours * HOUR };
}

/** Whether a duration a device sent is one the bell offers. */
export function isMuteHours(v: unknown): v is MuteHours {
  return (MUTE_HOURS as readonly unknown[]).includes(v);
}

/** The mute as kept (only `until`), or null when it is not one: a file from before, or broken. */
export function sanitizeMute(raw: unknown): NotificationMute | null {
  if (!raw || typeof raw !== 'object' || !('until' in raw)) return null;
  const { until } = raw;
  if (until === null) return { until: null };
  return typeof until === 'number' && Number.isFinite(until) && until > 0 ? { until } : null;
}

/** What the bell says while muted: «Silenciadas hasta las 18:00», «… hasta mañana a las 02:00», «… hasta nuevo aviso». */
export function describeMute(mute: NotificationMute, now: number): string {
  if (mute.until === null) return 'Silenciadas hasta nuevo aviso';
  const end = new Date(mute.until);
  const time = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
  return end.toDateString() === new Date(now).toDateString() ? `Silenciadas hasta las ${time}` : `Silenciadas hasta mañana a las ${time}`;
}
