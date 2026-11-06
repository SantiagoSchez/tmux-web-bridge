import { signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { PaneState, RateLimits, UsageSample } from '../../../shared/types';
import { openWindow, route } from '../router';
import { findWindow, hosts, STATE_LABEL, usageSamples, type PaneRef } from '../state';

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

type Tip = { key: string; anchor: DOMRect };

/** The meter whose details are open, if any: one at a time, for every row. */
const tip = signal<Tip | null>(null);

/**
 * One limit: its label, its bar and, if it would run out before its reset, a ⚠.
 * A tap opens the details (time left, reset date, forecast) in a tooltip, so the
 * strip stays short on a phone without losing them.
 */
function Meter({ id, label, pct, resetsAt, now, runsOut }: { id: string; label: string; pct: number; resetsAt: number; now: number; runsOut: number | null }) {
  const reset = resetsAt > 0 && resetsAt <= now; // the window already restarted since it was read
  const value = reset ? 0 : Math.max(0, Math.min(100, Math.round(pct)));
  const level = value >= 80 ? 'high' : value >= 60 ? 'mid' : 'low';
  const open = tip.value?.key === id;
  const toggle = (e: MouseEvent) => {
    tip.value = open ? null : { key: id, anchor: (e.currentTarget as HTMLElement).getBoundingClientRect() };
  };
  return (
    <>
      <button
        type="button"
        class={`limit ${reset ? 'reset' : ''} ${open ? 'open' : ''}`}
        aria-expanded={open}
        aria-label={`Uso ${label}: ${value}%${runsOut ? ', llegarás al 100% antes del reinicio' : ''}`}
        onClick={toggle}
      >
        <span class="limit-label">{label}</span>
        <span class={`limit-bar ${level}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
          <span class="limit-fill" style={{ width: `${value}%` }} />
          <span class="limit-pct">{value}%</span>
        </span>
        {runsOut && <span class="limit-eta">⚠</span>}
      </button>
      {open && (
        <LimitTip anchor={tip.value!.anchor}>
          <div class="limit-tip-head">
            {label} · {value}%
          </div>
          {reset ? (
            <div>Reiniciado</div>
          ) : resetsAt > 0 ? (
            <div>
              Se reinicia en {left(resetsAt - now)} <span class="limit-when">({when(resetsAt)})</span>
            </div>
          ) : null}
          {runsOut && (
            <div class="limit-tip-eta">
              ⚠ Al ritmo actual llegas al 100% en {left(runsOut - now)} <span class="limit-when">({when(runsOut)})</span>, antes del reinicio
            </div>
          )}
        </LimitTip>
      )}
    </>
  );
}

/**
 * The details of a meter, under it and inside the screen. Fixed rather than
 * absolute: the strip cuts (or, on phones, scrolls) what overflows it. It closes
 * with a tap elsewhere, Escape, or when anything scrolls or resizes.
 */
function LimitTip({ anchor, children }: { anchor: DOMRect; children: ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null);
  const [x, setX] = useState<number | null>(null);
  useLayoutEffect(() => {
    const w = ref.current!.offsetWidth;
    const center = anchor.left + anchor.width / 2;
    setX(Math.max(8, Math.min(innerWidth - 8 - w, center - w / 2)));
  }, [anchor]);
  useEffect(() => {
    const close = () => (tip.value = null);
    const down = (e: PointerEvent) => {
      const t = e.target as Element;
      if (!ref.current?.contains(t) && !t.closest?.('.limit')) close();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    addEventListener('pointerdown', down, true);
    addEventListener('keydown', key);
    addEventListener('scroll', close, true);
    addEventListener('resize', close);
    return () => {
      removeEventListener('pointerdown', down, true);
      removeEventListener('keydown', key);
      removeEventListener('scroll', close, true);
      removeEventListener('resize', close);
    };
  }, []);
  return (
    <div ref={ref} class="limit-tip" role="tooltip" style={{ top: `${anchor.bottom + 6}px`, left: `${x ?? anchor.left}px`, visibility: x === null ? 'hidden' : undefined }}>
      {children}
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

/** The freshest reading of each account among all hosts; those without one (older statuslines) last. */
function accounts(): RateLimits[] {
  const by = new Map<string, RateLimits>();
  for (const h of hosts.value)
    for (const l of h.limits ?? []) {
      const prev = by.get(l.account ?? '');
      if (!prev || l.updatedAt > prev.updatedAt) by.set(l.account ?? '', l);
    }
  return [...by.values()].sort((a, b) => Number(!a.account) - Number(!b.account) || (a.account ?? '').localeCompare(b.account ?? ''));
}

/** The account of the Claude in the pane open in the app (its active one if none is picked), if any. */
function openAccount(): string | undefined {
  const r = route.value;
  if (r.name !== 'window') return undefined;
  const panes = findWindow(r.host, r.window)?.window.panes ?? [];
  const pane = panes.find((p) => (r.pane ? p.id === r.pane : p.active));
  return pane?.state && pane.state !== 'ssh' ? pane.account : undefined;
}

/** One account's row: its email (only the part before @ on phones) and both meters. */
function Account({ limits, samples, now, dim }: { limits: RateLimits; samples: UsageSample[]; now: number; dim?: boolean }) {
  const { account, fiveHour, sevenDay } = limits;
  const mine = samples.filter((s) => s.account === account);
  const at = account?.indexOf('@') ?? -1;
  const age = left(now - limits.updatedAt);
  return (
    <div class={`limit-row ${dim === false ? 'current' : dim ? 'dim' : ''}`}>
      <span class="limit-account" title={`${account ? `${account} · ` : ''}leídos hace ${age === '—' ? 'un momento' : age}`}>
        {at > 0 ? (
          <>
            {account!.slice(0, at)}
            <span class="limit-domain">{account!.slice(at)}</span>
          </>
        ) : (
          account
        )}
      </span>
      <Meter id={`${account ?? ''}|5h`} label="5h" pct={fiveHour.pct} resetsAt={fiveHour.resetsAt} now={now} runsOut={runsOutAt(mine, 'five', fiveHour.pct, fiveHour.resetsAt, now)} />
      <Meter id={`${account ?? ''}|7d`} label="7d" pct={sevenDay.pct} resetsAt={sevenDay.resetsAt} now={now} runsOut={runsOutAt(mine, 'seven', sevenDay.pct, sevenDay.resetsAt, now)} />
    </div>
  );
}

/**
 * Claude's usage limits (5 h and 7 d), one row per account, shared by all of its
 * agents: the freshest reading published by any host's statusline.
 */
export function LimitsBar() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(t);
  }, []);

  const list = accounts();
  const states = groups();
  if (!list.length && !states.length) return null;

  const samples = usageSamples.value;
  // With a Claude open, the other accounts fade (only if it is one of the rows).
  const open = openAccount();
  const current = list.length > 1 && list.some((l) => l.account === open) ? open : undefined;
  return (
    <div class={`limits ${states.length ? 'has-summary' : ''}`}>
      {states.length > 0 && <Summary groups={states} />}
      {list.length > 0 && (
        <div class="limit-meters">
          {list.map((l) => (
            <Account key={l.account ?? ''} limits={l} samples={samples} now={now} dim={current === undefined ? undefined : l.account !== current} />
          ))}
        </div>
      )}
    </div>
  );
}
