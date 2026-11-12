// When an automation runs: on some days of the week at a time, every few hours, or a
// cron expression (minute hour day-of-month month day-of-week). Times are the hub's
// local time (TZ, Europe/Madrid in the Docker image); the panel computes the same.

export type Schedule =
  /** On these days of the week (0 Sunday … 6 Saturday) at HH:MM. */
  | { kind: 'days'; days: number[]; time: string }
  /** Every `hours` hours from midnight (0, n, 2n… o'clock), at that minute. */
  | { kind: 'every'; hours: number; minute: number }
  | { kind: 'cron'; expr: string };

export const EVERY_HOURS = [1, 2, 3, 4, 6, 8, 12] as const;
export const DAY_LETTERS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'] as const;
const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

// ---------------------------------------------------------------- cron

interface Cron {
  minute: Set<number>;
  hour: Set<number>;
  dom: Set<number>;
  month: Set<number>;
  dow: Set<number>;
  /** Restricted (not *): with both, a day matches either one, as in cron. */
  domStar: boolean;
  dowStar: boolean;
}

function field(text: string, min: number, max: number, what: string): Set<number> {
  const out = new Set<number>();
  for (const part of text.split(',')) {
    const m = /^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(part);
    if (!m) throw new Error(`No entiendo «${part}» en ${what}`);
    const step = m[4] ? Number(m[4]) : 1;
    let from = min;
    let to = max;
    if (m[1] !== '*') {
      from = Number(m[2]);
      to = m[3] !== undefined ? Number(m[3]) : m[4] ? max : from;
    }
    if (from < min || to > max || from > to || step < 1) throw new Error(`«${part}» se sale de ${what} (${min}-${max})`);
    for (let v = from; v <= to; v += step) out.add(v);
  }
  return out;
}

export function parseCron(expr: string): Cron {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error('Un cron son 5 campos: minuto hora día mes día-de-la-semana');
  const dow = field(parts[4], 0, 7, 'el día de la semana');
  if (dow.has(7)) {
    dow.delete(7);
    dow.add(0);
  }
  return {
    minute: field(parts[0], 0, 59, 'los minutos'),
    hour: field(parts[1], 0, 23, 'las horas'),
    dom: field(parts[2], 1, 31, 'el día del mes'),
    month: field(parts[3], 1, 12, 'el mes'),
    dow,
    domStar: parts[2] === '*',
    dowStar: parts[4] === '*',
  };
}

function cronDayOk(c: Cron, d: Date): boolean {
  const dom = c.dom.has(d.getDate());
  const dow = c.dow.has(d.getDay());
  if (c.domStar && c.dowStar) return true;
  if (c.domStar) return dow;
  if (c.dowStar) return dom;
  return dom || dow;
}

/** The first minute after `after` that the cron matches, within about four years. */
function nextCron(c: Cron, after: Date): Date | null {
  const d = new Date(after);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  const limit = after.getTime() + 4 * 366 * 86_400_000;
  while (d.getTime() < limit) {
    if (!c.month.has(d.getMonth() + 1)) {
      d.setMonth(d.getMonth() + 1, 1);
      d.setHours(0, 0, 0, 0);
    } else if (!cronDayOk(c, d)) {
      d.setDate(d.getDate() + 1);
      d.setHours(0, 0, 0, 0);
    } else if (!c.hour.has(d.getHours())) {
      d.setHours(d.getHours() + 1, 0, 0, 0);
    } else if (!c.minute.has(d.getMinutes())) {
      d.setMinutes(d.getMinutes() + 1, 0, 0);
    } else {
      return d;
    }
  }
  return null;
}

// ---------------------------------------------------------------- schedules

/** Why a schedule cannot run, or null if it is fine. */
export function scheduleProblem(s: unknown): string | null {
  if (!s || typeof s !== 'object') return 'Falta el horario';
  const x = s as Partial<Schedule> & Record<string, unknown>;
  if (x.kind === 'days') {
    if (!Array.isArray(x.days) || !x.days.length || x.days.some((d) => !Number.isInteger(d) || (d as number) < 0 || (d as number) > 6)) return 'Elige al menos un día';
    if (typeof x.time !== 'string' || !TIME.test(x.time)) return 'La hora tiene que ser HH:MM';
    return null;
  }
  if (x.kind === 'every') {
    if (!(EVERY_HOURS as readonly number[]).includes(x.hours as number)) return 'Cada cuántas horas: 1, 2, 3, 4, 6, 8 o 12';
    if (!Number.isInteger(x.minute) || (x.minute as number) < 0 || (x.minute as number) > 59) return 'El minuto va de 0 a 59';
    return null;
  }
  if (x.kind === 'cron') {
    if (typeof x.expr !== 'string') return 'Falta la expresión cron';
    try {
      parseCron(x.expr);
      return null;
    } catch (err) {
      return (err as Error).message;
    }
  }
  return 'Horario desconocido';
}

/** The first time after `after` it runs (null for an invalid schedule, or a cron that never matches). */
export function nextRun(s: Schedule, after: Date): Date | null {
  if (scheduleProblem(s)) return null;
  if (s.kind === 'cron') return nextCron(parseCron(s.expr), after);
  if (s.kind === 'days') {
    const [h, m] = s.time.split(':').map(Number);
    return nextCron({ minute: new Set([m]), hour: new Set([h]), dom: new Set(), month: new Set(range(1, 12)), dow: new Set(s.days), domStar: true, dowStar: false }, after);
  }
  const hours = range(0, 23).filter((h) => h % s.hours === 0);
  return nextCron({ minute: new Set([s.minute]), hour: new Set(hours), dom: new Set(), month: new Set(range(1, 12)), dow: new Set(), domStar: true, dowStar: true }, after);
}

function range(a: number, b: number): number[] {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

/** In words: «Cada día a las 18:00», «Laborables a las 09:30», «Lunes y jueves a las 08:00», «Cada 6 h (y 15)», «Cron 0 3 * * 1». */
export function describeSchedule(s: Schedule): string {
  if (s.kind === 'cron') return `Cron ${s.expr.trim()}`;
  if (s.kind === 'every') return s.minute ? `Cada ${s.hours} h, a y ${String(s.minute).padStart(2, '0')}` : `Cada ${s.hours} h, en punto`;
  const days = [...new Set(s.days)].sort();
  const key = days.join('');
  const when = key === '0123456' ? 'Cada día' : key === '12345' ? 'Laborables' : key === '06' ? 'Fines de semana' : list(days.sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => DAY_NAMES[d]));
  return `${when[0].toUpperCase()}${when.slice(1)} a las ${s.time}`;
}

function list(items: string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}
