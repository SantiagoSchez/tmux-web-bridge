import { signal } from '@preact/signals';

/** Now, every 30 s: reading it makes «hace 3 min» keep up by itself. */
export const clock = signal(Date.now());
setInterval(() => (clock.value = Date.now()), 30_000);

/** «ahora», «hace 3 min», «hace 2 h», «hace 3 d». */
export function ago(t: number, now = clock.value): string {
  const s = Math.max(0, (now - t) / 1000);
  if (s < 60) return 'ahora';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86_400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86_400)} d`;
}

/** A length of time: «40 s», «12 min», «1 h 5 min». */
export function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
}
