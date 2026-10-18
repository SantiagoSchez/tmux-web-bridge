import { useEffect, useState } from 'preact/hooks';
import type { PaneState, RateLimits, UsageSample } from '../../../shared/types';
import { openWindow, route } from '../router';
import { hosts, STATE_LABEL, usageSamples, type PaneRef } from '../state';

/** "2d23h", "3h37m", "45m": time left until a reset, like the Claude Code statusline. */
function left(seconds: number): string {
  if (seconds <= 0) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d${h}h`;
  if (h > 0) return `${h}h${m}m`;
  return `${m}m`;
}

function when(epoch: number): string {
  const d = new Date(epoch * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

type Window = 'five' | 'seven';

/** How far back the pace is measured, and the shortest stretch that says anything. */
const PACE: Record<Window, { lookback: number; minSpan: number }> = {
  five: { lookback: 30 * 60, minSpan: 10 * 60 },
  seven: { lookback: 6 * 3600, minSpan: 3600 },
};

/**
 * When the limit would hit 100% at the pace of the last stretch (30 min for 5 h,
 * 6 h for the week), or null if it lasts until its reset. The pace is measured up
 * to now, not to the last reading: time without Claude working slows it down.
 */
function runsOutAt(samples: UsageSample[], w: Window, pct: number, resetsAt: number, now: number): number | null {
  if (pct >= 100 || resetsAt <= now) return null;
  const same = samples.filter((s) => Math.abs((w === 'five' ? s.fiveReset : s.sevenReset) - resetsAt) < 120);
  if (!same.length) return null;
  const { lookback, minSpan } = PACE[w];
  const from = now - lookback;
  const before = same.filter((s) => s.t <= from).pop();
  const t0 = before ? from : same[0].t;
  const p0 = before ? before[w] : same[0][w];
  if (now - t0 < minSpan || pct <= p0) return null;
  const at = now + ((100 - pct) * (now - t0)) / (pct - p0);
  return at < resetsAt ? at : null;
}

function Meter({ label, pct, resetsAt, now, runsOut }: { label: string; pct: number; resetsAt: number; now: number; runsOut: number | null }) {
  const reset = resetsAt > 0 && resetsAt <= now; // the window already restarted since it was read
  const value = reset ? 0 : Math.max(0, Math.min(100, Math.round(pct)));
  const level = value >= 80 ? 'high' : value >= 60 ? 'mid' : 'low';
  return (
    <div class={`limit ${reset ? 'reset' : ''}`} title={resetsAt ? `Se reinicia el ${when(resetsAt)}` : undefined}>
      <span class="limit-label">{label}</span>
      <span class={`limit-bar ${level}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-label={`Uso ${label}`}>
        <span class="limit-fill" style={{ width: `${value}%` }} />
        <span class="limit-pct">{value}%</span>
      </span>
      <span class="limit-left">
        {reset ? 'reiniciado' : left(resetsAt - now)}
        {!reset && resetsAt > 0 && <span class="limit-when"> ({when(resetsAt)})</span>}
      </span>
      {runsOut && (
        <span class="limit-eta" title={`Al ritmo actual llegas al 100% el ${when(runsOut)}, antes del reinicio`}>
          ⚠ 100% en {left(runsOut - now)}
        </span>
      )}
    </div>
  );
}

const SUMMARY: { state: PaneState; icon: string }[] = [
  { state: 'question', icon: '🙋' },
  { state: 'attention', icon: '💬' },
  { state: 'done', icon: '✅' },
  { state: 'busy', icon: '🔨' },
];

type Group = { state: PaneState; icon: string; panes: PaneRef[] };

/** Panes of every machine by state, in list order; only the states with any. */
function groups(): Group[] {
  const by = new Map<PaneState, PaneRef[]>();
  for (const host of hosts.value) {
    if (host.status !== 'ok') continue;
    for (const session of [...host.sessions].sort((a, b) => (a.num ?? 99) - (b.num ?? 99)))
      for (const window of session.windows)
        for (const pane of window.panes) if (pane.state) by.set(pane.state, [...(by.get(pane.state) ?? []), { host, session, window, pane }]);
  }
  return SUMMARY.filter((s) => by.has(s.state)).map((s) => ({ ...s, panes: by.get(s.state)! }));
}

/** Claude in every machine at a glance; a tap goes to the next pane in that state. */
function Summary({ groups }: { groups: Group[] }) {
  const next = (list: PaneRef[]) => {
    const r = route.value;
    const here = list.findIndex(
      (p) => r.name === 'window' && p.host.id === r.host && p.window.id === r.window && (r.pane ? p.pane.id === r.pane : p.pane.active),
    );
    const p = list[(here + 1) % list.length];
    openWindow(p.host.id, p.window.id, p.pane.id);
  };
  return (
    <div class="summary">
      {groups.map(({ state, icon, panes }) => (
        <button key={state} class="summary-item" title={`${STATE_LABEL[state]}: ${panes.length} · ir al siguiente`} onClick={() => next(panes)}>
          {icon}
          <span>{panes.length}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Claude's usage limits for the account (5 h and 7 d), shared by every agent:
 * the freshest reading published by any host's statusline.
 */
export function LimitsBar() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(t);
  }, []);

  let latest: RateLimits | null = null;
  for (const h of hosts.value) if (h.limits && (!latest || h.limits.updatedAt > latest.updatedAt)) latest = h.limits;
  const states = groups();
  if (!latest && !states.length) return null;

  const samples = usageSamples.value;
  const age = latest ? now - latest.updatedAt : 0;
  return (
    <div class={`limits ${states.length ? 'has-summary' : ''}`}>
      {states.length > 0 && <Summary groups={states} />}
      {latest && (
        <div class="limit-meters" title={`Límites de uso de Claude · leídos hace ${left(age) === '—' ? 'un momento' : left(age)}`}>
          <Meter
            label="5h"
            pct={latest.fiveHour.pct}
            resetsAt={latest.fiveHour.resetsAt}
            now={now}
            runsOut={runsOutAt(samples, 'five', latest.fiveHour.pct, latest.fiveHour.resetsAt, now)}
          />
          <Meter
            label="7d"
            pct={latest.sevenDay.pct}
            resetsAt={latest.sevenDay.resetsAt}
            now={now}
            runsOut={runsOutAt(samples, 'seven', latest.sevenDay.pct, latest.sevenDay.resetsAt, now)}
          />
        </div>
      )}
    </div>
  );
}
